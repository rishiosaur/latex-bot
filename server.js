const express = require("express");
const bodyParser = require("body-parser");
const svgToImg = require("svg-to-img");
var mjAPI = require("mathjax-node");
const axios = require("axios");
const fetch = require('node-fetch');
const { App } = require("@slack/bolt");
const jimp = require('jimp')
require("dotenv").config()
const svg2png = require("svg2png");
const sharp = require("sharp")

mjAPI.config({
  MathJax: {
  }
});
mjAPI.start();

const app = express()

const bolt = new App({
  token: process.env.BOT_TOKEN,
  signingSecret: process.env.SIGN_SECRET
})

const PORT = process.env.PORT || 3600

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json())

app.post("/", async (req, res) => {
  res.send(`Your request to parse \`"${req.body.text}"\` has been received.`)

  if(req.body.text === "") {
    console.log("whitespace error")
    await res.send("whitespace error").catch(err => console.log(err))
    await res.end().catch(err => console.log(err))
    return;
  }

  const math = req.body.text

  const typesettedData = await mjAPI.typeset({
    math: math,
    format: "TeX",
    svg: true,
    ex: 13,
  }).catch(err => {
    res.send(`Error(s): ${err.join(", ")}`)
    return;
  })
  
  await require("fs").writeFileSync("./output/typesettedSvg.svg", typesettedData.svg)

  await sharp("./output/typesettedSvg.svg").png({compressionLevel: 0, progressive: true}).negate().extend({
    top: 10,
    bottom: 10,
    left: 10,
    right: 10,
    background: { r: 255, g: 255, b: 255, alpha: 1 }
  }).toFile('./output/img.png')

  const image = await jimp.read('./output/img.png').catch(err => console.log(err));

  await image.cover(image.getWidth() * 1.5, image.getHeight() * 1.5).writeAsync("./output/paddedImage.png").catch(err => res.send(err))

  bolt.client.files.upload({
    token: process.env.BOT_TOKEN,
    title: "Typesetted Equation!",
    file: await require("fs").readFileSync("./output/paddedImage.png"),
    channels: req.body.channel_id
  }).catch(err => res.send(`Error uploading file: ${err}`))
  res.end()
})

app.listen(PORT, () => {
  console.log(`Server is running on PORT ${PORT}`)
});


