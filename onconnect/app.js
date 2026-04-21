const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));

exports.handler = async event => {
  const campaignId = event.queryStringParameters ? event.queryStringParameters.campaign : "";
  const isDM = event.queryStringParameters && event.queryStringParameters.DM;

  const objectId = isDM
    ? "conn#DM#" + event.requestContext.connectionId
    : "conn#PLAYERS#" + event.requestContext.connectionId;

  console.log("Adding " + objectId + " to " + campaignId);

  const putParams = {
    TableName: process.env.TABLE_NAME,
    Item: {
      campaignId: campaignId,
      objectId: objectId,
      connectionId: event.requestContext.connectionId,
      timestamp: Date.now(),
    },
  };

  try {
    await ddb.send(new PutCommand(putParams));
  } catch (err) {
    return { statusCode: 500, body: 'Failed to connect: ' + JSON.stringify(err) };
  }

  return { statusCode: 200, body: 'Connected.' };
};
