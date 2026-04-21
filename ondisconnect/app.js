// https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-route-keys-connect-disconnect.html
// The $disconnect route is executed after the connection is closed.
// The connection can be closed by the server or by the client. As the connection is already closed when it is executed,
// $disconnect is a best-effort event.
// API Gateway will try its best to deliver the $disconnect event to your integration, but it cannot guarantee delivery.

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));

exports.handler = async event => {
  console.log("trying to delete " + event.requestContext.connectionId);

  const queryParams = {
    TableName: process.env.TABLE_NAME,
    IndexName: 'connectionIds',
    KeyConditionExpression: "connectionId = :connectionId",
    ExpressionAttributeValues: {
      ":connectionId": event.requestContext.connectionId,
    },
  };

  const toDelete = await ddb.send(new QueryCommand(queryParams));

  const deleting = toDelete.Items.map(async ({ campaignId, objectId }) => {
    console.log("Deleting campaignId: " + campaignId + " objectId: " + objectId);
    return ddb.send(new DeleteCommand({
      TableName: process.env.TABLE_NAME,
      Key: { campaignId, objectId },
    }));
  });

  try {
    await Promise.allSettled(deleting);
  } catch (e) {
    return { statusCode: 500, body: e.stack };
  }

  return { statusCode: 200, body: 'Disconnected.' };
};
