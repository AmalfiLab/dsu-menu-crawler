const axios = require('axios').default;
const { MenuParser, options } = require('@amalfilab/dsu-menu-parser');
const AWS = require('aws-sdk');
require('dotenv').config();

AWS.config.update({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESSS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const urlTemplates = {
  martiri: "https://www.dsu.toscana.it/it/Menù-dal-${START}-al-${END}-martiri.pdf"
};

function applyUrlTemplate(template, startDate, endDate) {
  let sDay = startDate.getDate();
  let sMonth = startDate.getMonth() + 1;
  const sYear = startDate.getFullYear();
  let eDay = endDate.getDate();
  let eMonth = endDate.getMonth() + 1;
  const eYear = endDate.getFullYear();

  if (sDay <= 9) sDay = "0" + sDay;
  if (sMonth <= 9) sMonth = "0" + sMonth;
  if (eDay <= 9) eDay = "0" + eDay;
  if (eMonth <= 9) eMonth = "0" + eMonth;

  return encodeURI(template
    .replace('${START}', `${sDay}.${sMonth}.${sYear}`)
    .replace('${END}', `${eDay}.${eMonth}.${eYear}`));
}

function getMenuLinks() {
  const now = new Date();
  const nowDay = now.getDay();

  const startDate = new Date(
    now.getFullYear(), now.getMonth(), now.getDate() - nowDay + 1);
  const endDate = new Date(
    now.getFullYear(), now.getMonth(), now.getDate() - nowDay + 7);
  
  return {
    martiri: applyUrlTemplate(urlTemplates.martiri, startDate, endDate)
  };
}

async function downloadPdf(url) {
  const res = await axios.get(url, { responseType: 'arraybuffer' });
  return res.data;
}

async function updateDatabase(menu) {
  let docClient = new AWS.DynamoDB.DocumentClient();
  const params = {
    TableName: 'menu',
    Key: {
      idMensa: 'martiri'
    },
    UpdateExpression: "set menu = :m, updatedAt = :d",
    ExpressionAttributeValues: {
      ":m": menu,
      ":d": Date.now()
    }
  };

  return new Promise((resolve, reject) => {
    docClient.update(params, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  })
}

async function main() {
  const { martiri: martiriUrl } = getMenuLinks();
  console.log("martiri url", martiriUrl);
  const buffer = await downloadPdf(martiriUrl);
  const parser = new MenuParser(buffer, options.martiri)

  const days = [
    "monday", "thursday", "wednesday",
    "tuesday", "friday", "saturday", "sunday"
  ];
  let menu = {};
  for (let dayOfWeek = 0; dayOfWeek < days.length; ++dayOfWeek) {
    const launch = await parser.getMenu(dayOfWeek, 'launch');
    const dinner = await parser.getMenu(dayOfWeek, 'dinner');
    menu[days[dayOfWeek]] = { launch, dinner };
  }

  console.log(menu);
  await updateDatabase(menu);
}

// https://github.com/awsdocs/aws-lambda-developer-guide/blob/master/sample-apps/nodejs-apig/function/index.js

exports.handler = async () => {
  try {
    await main();
    return { "statusCode": 200 };
  } catch (error) {
    console.error(error.message);
    return { "statusCode": 500, body: error.message };
  }
}