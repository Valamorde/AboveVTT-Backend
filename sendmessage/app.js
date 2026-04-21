const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, PutCommand, DeleteCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { ApiGatewayManagementApiClient, PostToConnectionCommand, DeleteConnectionCommand } = require('@aws-sdk/client-apigatewaymanagementapi');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));

const { TABLE_NAME } = process.env;

function makeApigw(event) {
  return new ApiGatewayManagementApiClient({
    endpoint: 'https://' + event.requestContext.domainName + '/' + event.requestContext.stage,
  });
}

function forwardMessage(event) {
  console.log("ForwardMessage()");
  const recvMessage = JSON.parse(event.body);
  const campaignId = recvMessage.campaignId;
  const senderId = event.requestContext.connectionId;

  return ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "campaignId = :hkey and begins_with(objectId,:skey)",
    ExpressionAttributeValues: { ':hkey': campaignId, ':skey': "conn#" },
  })).then(function (connectionData) {
    const apigw = makeApigw(event);

    let recvMessageEdit = JSON.parse(event.body);
    recvMessageEdit.requestTimeEpoch = String(event.requestContext.requestTimeEpoch);
    const eventBodySend = JSON.stringify(recvMessageEdit);

    let counter = 0;

    connectionData.Items.sort((a, b) => b.timestamp - a.timestamp);

    const MAX_CONNECTIONS = 30;
    let toDelete = [];
    if (connectionData.Items.length > MAX_CONNECTIONS) {
      console.log("DELETING OLDER CONNECTIONS EXCEEDING MAX_CONNECTIONS");
      const numToDelete = connectionData.Items.length - MAX_CONNECTIONS;
      toDelete = connectionData.Items.splice(-numToDelete, numToDelete);
    }

    // DELETE CONNECTIONS EXCEEDING MAX_CONNECTIONS SO I DON'T HAVE TO PAY 40$/hour for a single fuck-up
    const deleteCalls = toDelete.map(({ objectId, connectionId }) => {
      return Promise.allSettled([
        apigw.send(new DeleteConnectionCommand({ ConnectionId: connectionId })),
        ddb.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { campaignId, objectId } })),
      ]);
    });

    const postCalls = connectionData.Items.map(({ objectId, connectionId, timestamp }) => {
      if (connectionId == senderId) return;

      if (timestamp < Date.now() - (1000 * 60 * 120)) {
        console.log(`Found expired connection, deleting ${connectionId}`);
        return ddb.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { campaignId, objectId } }));
      }

      counter++;
      return apigw.send(new PostToConnectionCommand({ ConnectionId: connectionId, Data: eventBodySend }))
        .catch(function (e) {
          if (e.$metadata?.httpStatusCode === 410 || e.name === 'GoneException') {
            console.log(`Found stale connection, deleting ${connectionId}`);
            return ddb.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { campaignId, objectId } }));
          }
        });
    });

    console.log("message queued for " + counter + " connections");
    return Promise.allSettled(postCalls.concat(deleteCalls));

  }).catch(function (e) {
    console.log('fuck. the query failed');
    console.log(e);
  });
}

async function sendSceneList(event) {
  const recvMessage = JSON.parse(event.body);
  const campaignId = recvMessage.campaignId;
  const apigw = makeApigw(event);

  const getReply = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'sceneProperties',
    KeyConditionExpression: "campaignId = :hkey",
    ExpressionAttributeValues: { ':hkey': campaignId },
  }));

  let scenelist = [];
  const promises = [];
  let force_scene = null;

  if (getReply.Items.length > 0) {
    console.log("DMjoin, found some scenes. I'll send them");
    scenelist = getReply.Items.map(element => element.data);
  } else {
    console.log("generating empty scene");
    force_scene = 666;
    const basicScene = {
      id: '666',
      title: "The Tavern",
      dm_map: "",
      player_map: "https://i.pinimg.com/originals/a2/04/d4/a204d4a2faceb7f4ae93e8bd9d146469.jpg",
      scale: "100",
      dm_map_usable: "0",
      fog_of_war: "1",
      tokens: {},
      grid: "0",
      hpps: "72",
      vpps: "72",
      snap: "1",
      fpsq: "5",
      offsetx: 29,
      offsety: 54,
      reveals: [[0, 0, 0, 0, 2, 0]],
      order: Date.now(),
    };
    scenelist = [basicScene];

    promises.push(ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: { campaignId, objectId: "scenes#" + basicScene.id + "#scenedata", sceneId: basicScene.id, data: basicScene, timestamp: Date.now() },
    })));
    promises.push(ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: { campaignId, objectId: "scenes#" + basicScene.id + "#fogdata", data: [[0, 0, 0, 0, 2, 0]] },
    })));
    promises.push(ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: { campaignId, objectId: "dmscene", data: "666" },
    })));
    promises.push(ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: { campaignId, objectId: "playerscene", data: "666" },
    })));
  }

  promises.push(
    get_current_scene_id(campaignId, false, force_scene).then(sceneid => {
      const sceneListMsg = { eventType: "custom/myVTT/scenelist", data: scenelist, playersSceneId: sceneid };
      return apigw.send(new PostToConnectionCommand({ ConnectionId: event.requestContext.connectionId, Data: JSON.stringify(sceneListMsg) }));
    })
  );

  await Promise.allSettled(promises);

  const sceneId = await get_current_scene_id(campaignId, true, force_scene);
  console.log("The Current Scene id is " + sceneId);
  const message = { eventType: "custom/myVTT/fetchscene", data: { sceneid: sceneId } };
  return apigw.send(new PostToConnectionCommand({ ConnectionId: event.requestContext.connectionId, Data: JSON.stringify(message) }));
}

async function delete_scene(event) {
  const recvMessage = JSON.parse(event.body);
  const campaignId = recvMessage.campaignId;
  const sceneId = recvMessage.data.id;

  console.log("deleting...");
  const sceneData = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "campaignId = :hkey and begins_with(objectId,:skey)",
    ExpressionAttributeValues: { ':hkey': campaignId, ':skey': "scenes#" + sceneId },
    ProjectionExpression: "objectId",
  }));

  console.log("I have to delete " + sceneData.Items.length + " objects");
  const promises = [];
  for (let i = 0; i < sceneData.Items.length; i += 25) {
    const batch_requests = sceneData.Items.slice(i, i + 25).map(({ objectId }) => ({
      DeleteRequest: { Key: { campaignId, objectId } },
    }));
    promises.push(ddb.send(new BatchWriteCommand({ RequestItems: { [TABLE_NAME]: batch_requests } })));
  }
  return Promise.allSettled(promises);
}

async function get_current_scene_id(campaignId, get_dm_scene, forced = null) {
  if (forced != null) return forced;
  const objectId = get_dm_scene ? "dmscene" : "playerscene";

  const data = await ddb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { campaignId, objectId },
  }));

  if (data.Item) {
    console.log("found the current scene");
    return data.Item.data;
  }
  console.log("didn't found the current scene");
  return null;
}

async function switch_scene(event) {
  const recvMessage = JSON.parse(event.body);
  const sceneId = recvMessage.data.sceneId;
  const campaignId = recvMessage.campaignId;
  const switch_dm = recvMessage.data.switch_dm ? true : false;

  console.log("executing switch_scene, searching for " + campaignId + " and scene " + sceneId);

  const connectionData = await ddb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "campaignId = :hkey and begins_with(objectId,:skey)",
    ExpressionAttributeValues: {
      ':hkey': campaignId,
      ':skey': "conn#" + (switch_dm ? "DM#" : "PLAYERS#"),
    },
  }));

  console.log("Got connectiondata");
  const apigw = makeApigw(event);
  const message = { eventType: "custom/myVTT/fetchscene", data: { sceneid: sceneId } };

  const promises = connectionData.Items.map(({ connectionId }) =>
    apigw.send(new PostToConnectionCommand({ ConnectionId: connectionId, Data: JSON.stringify(message) }))
      .catch(function () {})
  );

  promises.push(ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: { campaignId, objectId: switch_dm ? "dmscene" : "playerscene", data: sceneId },
  })));

  return Promise.allSettled(promises);
}

async function update_scene(event) {
  const recvMessage = JSON.parse(event.body);
  const campaignId = recvMessage.campaignId;
  const promises = [];

  const objectId = "scenes#" + recvMessage.data.id + "#scenedata";

  if (recvMessage.data.isnewscene) {
    delete recvMessage.data.isnewscene;
    promises.push(ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: { campaignId, objectId: "scenes#" + recvMessage.data.id + "#fogdata", data: [[0, 0, 0, 0, 2, 0]] },
    })));
  }

  promises.push(ddb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: { campaignId, objectId, data: recvMessage.data, sceneId: recvMessage.data.id },
  })));

  const switch_dm = recvMessage.data.id === recvMessage.sceneId;
  if (switch_dm) {
    console.log("forcing dm update after update_scene");
    const fakeEvent = Object.assign({}, event, {
      body: JSON.stringify({ campaignId: recvMessage.campaignId, data: { sceneId: recvMessage.data.id, switch_dm: true } }),
    });
    promises.push(switch_scene(fakeEvent));
  }

  const switch_players = recvMessage.data.id === recvMessage.playersSceneId;
  if (switch_players) {
    console.log("forcing players update after update_scene");
    const fakeEvent = Object.assign({}, event, {
      body: JSON.stringify({ campaignId: recvMessage.campaignId, data: { sceneId: recvMessage.data.id } }),
    });
    promises.push(switch_scene(fakeEvent));
  }

  return Promise.allSettled(promises).then(statuses => { console.log("statuses from update_scene"); console.log(statuses); });
}

async function handle_player_join(event) {
  const recvMessage = JSON.parse(event.body);
  const campaignId = recvMessage.campaignId;
  const apigw = makeApigw(event);

  const sceneId = await get_current_scene_id(campaignId, false);
  console.log("sending back the message with the current scene data after a playerjoin");
  const message = { eventType: "custom/myVTT/fetchscene", data: { sceneid: sceneId } };
  return apigw.send(new PostToConnectionCommand({ ConnectionId: event.requestContext.connectionId, Data: JSON.stringify(message) }));
}

// REQUEST HANDLER
exports.handler = async event => {
  const recvMessage = JSON.parse(event.body);
  if (recvMessage.eventType == "custom/myVTT/keepalive")
    return { statusCode: 200, body: 'Data sent.' };

  let doForwardMessage = true;
  const campaignId = recvMessage.campaignId;
  const isCloud = recvMessage.cloud == 1;
  const promises = [];

  console.log("Campaign " + campaignId + " Event: " + recvMessage.eventType + " requestTimeEpoch: " + event.requestContext.requestTimeEpoch);

  if (isCloud && recvMessage.eventType == "custom/myVTT/dmjoin") {
    promises.push(sendSceneList(event));
  }

  if (isCloud && recvMessage.eventType == "custom/myVTT/playerjoin") {
    console.log("got a player join!");
    promises.push(handle_player_join(event));
  }

  if (isCloud && recvMessage.eventType == "custom/myVTT/switch_scene") {
    promises.push(switch_scene(event));
    doForwardMessage = false;
  }

  if (isCloud && recvMessage.eventType == "custom/myVTT/token") {
    promises.push(ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: { campaignId, objectId: "scenes#" + recvMessage.sceneId + "#tokens#" + recvMessage.data.id, data: recvMessage.data, timestamp: Date.now() },
    })));
  }

  if (isCloud && recvMessage.eventType == "custom/myVTT/delete_token") {
    promises.push(ddb.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { campaignId, objectId: "scenes#" + recvMessage.sceneId + "#tokens#" + recvMessage.data.id },
    })));
  }

  if (isCloud && recvMessage.eventType == "custom/myVTT/delete_scene") {
    promises.push(delete_scene(event));
  }

  if (isCloud && recvMessage.eventType == "custom/myVTT/fogdata") {
    promises.push(ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: { campaignId, objectId: "scenes#" + recvMessage.sceneId + "#fogdata", data: recvMessage.data, timestamp: Date.now() },
    })));
  }

  if (isCloud && recvMessage.eventType == "custom/myVTT/drawdata") {
    promises.push(ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: { campaignId, objectId: "scenes#" + recvMessage.sceneId + "#drawdata", data: recvMessage.data, timestamp: Date.now() },
    })));
  }

  if (isCloud && recvMessage.eventType == "custom/myVTT/update_scene") {
    promises.push(update_scene(event));
    doForwardMessage = false;
  }

  if (doForwardMessage)
    promises.push(forwardMessage(event));

  try {
    await Promise.allSettled(promises);
  } catch (err) {
    console.log('Oh Oh. Something wrong');
    console.log(err);
    return { statusCode: 500, body: 'Failed to connect: ' + JSON.stringify(err) };
  }
  console.log("finished");
  return { statusCode: 200, body: 'Data sent.' };
};
