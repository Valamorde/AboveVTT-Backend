const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));

exports.handler = async event => {
  const action = event.queryStringParameters ? event.queryStringParameters.action : "";

  if (action == "getCampaignData") {
    const campaignId = event.queryStringParameters ? event.queryStringParameters.campaign : "";
    return ddb.send(new GetCommand({
      TableName: process.env.TABLE_NAME,
      Key: { campaignId, objectId: 'campaigndata' },
    })).catch(function () {
      return {};
    });
  }

  if (action == "setCampaignData") {
    const campaignId = event.queryStringParameters ? event.queryStringParameters.campaign : "";
    console.log("logging full event diocane");
    console.log(event);
    const campaignData = JSON.parse(event.body);

    return ddb.send(new PutCommand({
      TableName: process.env.TABLE_NAME,
      Item: {
        campaignId,
        objectId: "campaigndata",
        data: campaignData,
        timestamp: Date.now(),
      },
    }));
  }

  if (action == "migrate") {
    console.log("GOT A MIGRATION REQUEST!");
    const campaignId = event.queryStringParameters ? event.queryStringParameters.campaign : "";
    const scenes = JSON.parse(event.body);
    console.log(scenes);
    let requests = [];

    let nextorder = 1000000;
    let nextid = 100;
    scenes.forEach(scene => {
      const fogData = scene.reveals;
      const drawData = scene.drawings;
      const tokens = scene.tokens;
      scene.reveals = [];
      scene.drawings = [];
      scene.tokens = {};

      if (!scene.order) {
        scene.order = nextorder;
        nextorder = nextorder + 1000000;
      }

      if (!scene.id) {
        scene.id = "migrated" + nextid;
        nextid = nextid + 100;
      }

      requests.push({ PutRequest: { Item: { campaignId, objectId: "scenes#" + scene.id + "#scenedata", sceneId: scene.id, data: scene, timestamp: Date.now() } } });
      requests.push({ PutRequest: { Item: { campaignId, objectId: "scenes#" + scene.id + "#fogdata", data: fogData, timestamp: Date.now() } } });
      requests.push({ PutRequest: { Item: { campaignId, objectId: "scenes#" + scene.id + "#drawdata", data: drawData, timestamp: Date.now() } } });

      for (const tokenid in tokens) {
        requests.push({ PutRequest: { Item: { campaignId, objectId: "scenes#" + scene.id + "#tokens#" + tokenid, data: tokens[tokenid], timestamp: Date.now() } } });
      }
    });

    requests.push({ PutRequest: { Item: { campaignId, objectId: "campaigndata", data: { cloud: 1 }, timestamp: Date.now() } } });

    console.log("preparing the batch writes");
    const promises = [];
    for (let i = 0; i < requests.length; i += 25) {
      const currentBatch = requests.slice(i, i + 25);
      console.log("adding batch with index " + i);
      promises.push(ddb.send(new BatchWriteCommand({
        RequestItems: { [process.env.TABLE_NAME]: currentBatch },
      })));
    }
    await Promise.allSettled(promises).then((results) => { console.log(results); });

    return { statusCode: 200, body: 'Migrated' };
  }

  if (action == "export_scenes") {
    const campaignId = event.queryStringParameters ? event.queryStringParameters.campaign : "";

    const queryReply = await ddb.send(new QueryCommand({
      TableName: process.env.TABLE_NAME,
      IndexName: 'sceneProperties',
      KeyConditionExpression: "campaignId = :hkey",
      ExpressionAttributeValues: { ':hkey': campaignId },
    }));

    const export_data = [];
    const scenelist = queryReply.Items.map(element => element.data);

    const promises = scenelist.map(scene => {
      const sceneId = scene.id;
      scene.tokens = {};
      scene.reveals = [];
      scene.drawings = [];

      return ddb.send(new QueryCommand({
        TableName: process.env.TABLE_NAME,
        KeyConditionExpression: "campaignId = :hkey and begins_with(objectId,:skey)",
        ExpressionAttributeValues: { ':hkey': campaignId, ':skey': "scenes#" + sceneId },
      })).then(sceneObjects => {
        sceneObjects.Items
          .filter(el => el.objectId.startsWith("scenes#" + sceneId + "#tokens#"))
          .forEach(el => scene.tokens[el.data.id] = el.data);

        const fogdata = sceneObjects.Items.find(el => el.objectId == "scenes#" + sceneId + "#fogdata");
        if (fogdata && fogdata.data) scene.reveals = fogdata.data;

        const drawdata = sceneObjects.Items.find(el => el.objectId == "scenes#" + sceneId + "#drawdata");
        if (drawdata && drawdata.data) scene.drawings = drawdata.data;

        export_data.push(scene);
      });
    });

    await Promise.allSettled(promises);
    return { statusCode: 200, body: JSON.stringify(export_data) };
  }

  if (action == "getScene") {
    const campaignId = event.queryStringParameters ? event.queryStringParameters.campaign : "";
    const sceneId = event.queryStringParameters ? event.queryStringParameters.scene : "";

    const data = await ddb.send(new QueryCommand({
      TableName: process.env.TABLE_NAME,
      KeyConditionExpression: "campaignId = :hkey and begins_with(objectId,:skey)",
      ExpressionAttributeValues: { ':hkey': campaignId, ':skey': "scenes#" + sceneId },
    }));

    console.log("got SceneData");
    const sceneData = data.Items.find(el => el.objectId == "scenes#" + sceneId + "#scenedata");
    sceneData.data.tokens = [];
    data.Items
      .filter(el => el.objectId.startsWith("scenes#" + sceneId + "#tokens#"))
      .forEach(el => sceneData.data.tokens.push(el.data));

    sceneData.data.reveals = [];
    const fogdata = data.Items.find(el => el.objectId == "scenes#" + sceneId + "#fogdata");
    if (fogdata && fogdata.data) sceneData.data.reveals = fogdata.data;

    sceneData.data.drawings = [];
    const drawdata = data.Items.find(el => el.objectId == "scenes#" + sceneId + "#drawdata");
    if (drawdata && drawdata.data) sceneData.data.drawings = drawdata.data;

    console.log("returning SceneData");
    return sceneData;
  }

  if (action == "getSceneList") {
    const campaignId = event.queryStringParameters ? event.queryStringParameters.campaign : "";
    return ddb.send(new QueryCommand({
      TableName: process.env.TABLE_NAME,
      IndexName: 'sceneProperties',
      KeyConditionExpression: "campaignId = :hkey",
      ExpressionAttributeValues: { ':hkey': campaignId },
    }));
  }

  if (action == "getCurrentScene") {
    const campaignId = event.queryStringParameters ? event.queryStringParameters.campaign : "";

    const [dmSceneResult, playerSceneResult] = await Promise.all([
      ddb.send(new GetCommand({ TableName: process.env.TABLE_NAME, Key: { campaignId, objectId: "dmscene" } })),
      ddb.send(new GetCommand({ TableName: process.env.TABLE_NAME, Key: { campaignId, objectId: "playerscene" } })),
    ]);

    return {
      dmscene: dmSceneResult.Item ? dmSceneResult.Item.data : "",
      playerscene: playerSceneResult.Item ? playerSceneResult.Item.data : "",
    };
  }

  return { statusCode: 200, body: 'unknown action' };
};
