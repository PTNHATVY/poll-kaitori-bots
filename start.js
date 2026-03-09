const { spawn } = require("child_process");

function runBot(path) {
  const bot = spawn("node", [path], { stdio: "inherit" });

  bot.on("close", (code) => {
    console.log(`${path} stopped with code ${code}`);
  });
}

runBot("Poll-bot/index.js");
runBot("kaitori-bot/index.js");
