const mineflayer = require('mineflayer')

function startBot(io) {

  const bot = mineflayer.createBot({
    host: 'IP_SERVER',
    username: 'USERNAME',
    password: 'PAROLA',
    version: false
  })

  bot.once('spawn', () => {
    console.log("Bot conectat")
  })

  bot.on('windowOpen', (window) => {
    const items = window.slots.map(slot => {
      if (!slot) return null
      return {
        name: slot.name,
        count: slot.count,
        slot: slot.slot
      }
    })

    io.emit("inventory", items)
  })

  io.on("connection", socket => {
    socket.on("click", data => {
      bot.clickWindow(data.slot, data.button, 0)
    })
  })
}

module.exports = startBot
