const express = require("express");
const bodyParser = require("body-parser");
var mjAPI = require("mathjax-node");
const { App } = require("@slack/bolt");
const jimp = require('jimp')
require("dotenv").config()
const sharp = require("sharp")

mjAPI.start();

const app = express()

const bolt = new App({
  token: process.env.BOT_TOKEN,
  signingSecret: process.env.SIGN_SECRET
})

const PORT = process.env.PORT || 3600

app.listen(PORT)

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json())

async function postUsrMsg(user, text, channel, res) {
  await bolt.client.chat.postEphemeral({
    channel: channel,
    text: text,
    token: process.env.BOT_TOKEN,
    user: user
  })
  await res.end()
}

const isOdd = num => num % 2 === 0;

function stripEndQuotes(s) {
  return s.replace("\u201c", "").replace("\u201d", "");
}

function parseArgs(text) {

  const optionDelimit = "|||"
  var optionsObject = {
    math: "", options: {
      scale: "0.25",
      message: "",
    }
  }

  if (text.includes(optionDelimit)) {

    options = text.split(optionDelimit)[1].trim().split(",,");

    optionsObject["math"] = text.split(optionDelimit)[0].trim();

    options.forEach((element) => {
      let split = element.split("=")

      optionsObject["options"][split[0]] = stripEndQuotes(split[1])

    })

  } else {
    optionsObject["math"] = text.trim();
  }

  return optionsObject

}

app.post('/', async (req, res) => {
  const prompt = parseArgs(req.body.text)
  await postUsrMsg(req.body.user_id, `Your request to parse \`"${prompt.math}"\` has been received. Please stand by as we typeset the expression.`, req.body.channel_id, res)

  if (req.body.text === "") {
    await postUsrMsg(req.body.user_id, "Please enter a string. You cannot enter nothing.", req.body.channel_id, res)
    return;
  }



  const math = prompt.math;

  const typesettedData = await mjAPI.typeset({
    math: math,
    format: "TeX",
    svg: true,
    ex: 13,
  }).catch(err => {
    postUsrMsg(req.body.user_id, `Error(s): ${err.join(", ")}`, req.body.channel_id, res)
    return;
  })

  if (typesettedData.width == 0 || typesettedData.height == 0) {
    await postUsrMsg(req.body.user_id, "There was a parsing issue. Please make sure your string is in LaTeX, and would compile correctly.", req.body.channel_id, res)
    return;
  }

  await uploadTypesettedData(typesettedData, prompt, res, req);

  await postFinalText(prompt, req);

  res.end()
})

async function uploadTypesettedData(typesettedData, prompt, res, req) {
  await require("fs").writeFileSync("./output/typesettedSvg.svg", typesettedData.svg);
  await sharp("./output/typesettedSvg.svg", { density: 700 }).png({ compressionLevel: 0, progressive: true }).negate().extend({
    top: 20,
    bottom: 20,
    left: 20,
    right: 20,
    background: { r: 255, g: 255, b: 255, alpha: 1 }
  }).toFile('./output/img.png');
  const image = await jimp.read('./output/img.png').catch(err => console.log(err));
  await image.cover(image.getWidth() * prompt.options.scale, image.getHeight() * prompt.options.scale).writeAsync("./output/paddedImage.png").catch(err => res.send(err));
  await bolt.client.files.upload({
    token: process.env.BOT_TOKEN,
    title: "Typesetted Equation!",
    file: await require("fs").readFileSync("./output/paddedImage.png"),
    channels: req.body.channel_id
  });
}

async function postFinalText(prompt, req) {
  let text = (prompt.options.message === "") ? `I've typesetted the LaTeX equation \`"${req.body.text}"\` using KaTeX. This equation was sent by: <@${req.body.user_id}>` : `${prompt.options.message} - <@${req.body.user_id}>`;
  await bolt.client.chat.postMessage({
    channel: req.body.channel_id,
    text: text,
    token: process.env.BOT_TOKEN
  });
}
