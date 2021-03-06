require('dotenv').config()
const Discord = require('discord.js')
const client = new Discord.Client()
const db = require('./db')
const schedule = require('node-schedule')
const startOfTomorrow = require('date-fns/start_of_tomorrow')
const differenceInHours = require('date-fns/difference_in_hours')
const bot = require('./services/discord')
const roles = require('./services/roles')
const channels = require('./services/channels')
const topics = require('./utils/topics')

bot.init(client)

let newDayJob = null
let warning1Job = null
let warning2Job = null

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`)

  // start the rest server
  // require('./services/server')

  if (newDayJob) newDayJob.cancel()
  if (warning1Job) warning1Job.cancel()
  if (warning2Job) warning2Job.cancel()

  newDayJob = schedule.scheduleJob('00 00 * * *', () => {
    bot.broadcastNewDay()
  })

  warning1Job = schedule.scheduleJob('00 18 * * *', () => {
    bot.broadcastWarning(6)
  })

  warning2Job = schedule.scheduleJob('00 22 * * *', () => {
    bot.broadcastWarning(2)
  })
})

client.on('error', error => {
  console.log(error)
})

client.on('message', msg => {
  if (msg.content.startsWith('!streak')) {
    // streak
    if(msg.channel.name) {
      handleStreak(msg)
    } else {
      msg.reply('You can\'t start a streak here, it has to be in a channel!')
    }
  } else if(msg.content.startsWith('!mystreaks')) {
    // checking streak
    messageCurrentStreaks(msg)
  } else if(msg.content.toLowerCase() === '!help') {
    // help
    messageHelp(msg)
  } else if(msg.content.toLowerCase() === 'good bot') {
    // good bot
    msg.reply('thanks 💯')
  } else if(msg.content.toLowerCase() === 'bad bot') {
    // bad bot
    msg.reply('sorry 😢')
  } else if(msg.content.toLowerCase() === '!timeleft') {
    // time left
    messageTimeLeft(msg)
  } else if(msg.content.toLowerCase() === '!stats') {
    // stats
    messageStats(msg)
  } else if(msg.content.toLowerCase() === '!toggledm') {
    // toggle notifications
    db.toggleDMs(msg)
  } else if(msg.content.toLowerCase() === '!showstreaks') {
    // message all streaks in a channel
    messageAllStreaksForChannel(msg)
  } else if(msg.content.toLowerCase() === '!togglementions') {
     // toggle notifications
     db.toggleMentions(msg)
  } else if(msg.content.toLowerCase() === '!showactivestreaks') {
    // message all active streaks
    messageAllActiveStreaks(msg)
  } else if (msg.content.startsWith('!setrole')) {
    // set the roles for active and top streaker
    roles.handleRoles(msg) 
  } else if (msg.content.startsWith('!setchannels')) {
    // set channels that users can build streaks in
    channels.handleChannels(msg)
  } else if (msg.content.startsWith('!checksetup')) {
    // check if they've fully set up the bot
    messageSetupChecklist(msg)
  }
})

client.on('guildMemberAdd', member => {
  console.log(`${member.user.username} joined the server!`)
  member.user.send(`Welcome!\n` +
    'The server you just joined uses StreakBot so you can keep up a daily routine of working on something, however minor, for your current project\n' + 
    'In order to start or continue a streak, simply send a message starting with !streak (with an optional #topic) in a specific channel along with a description of what you did\nYou can also type !help if you ever forget any commands')
})

client.on('guildCreate', guild => {
  guild.channels.create('streakbot-setup', { type: 'text' }).then(channel => {
    channel.send('Before users can start creating streaks, you\'ll need to setup a few things:\n\n' +
    '1. Setup the top streaker role - a role assigned to users with the highest streaks at the start of a new day. Use: `!setrole top [role name/id]`\n\n' +
    '2. Setup the active streaker role - a role assigned to users with an active streak at the start of a new day. Use: `!setrole active [role name/id]`\n\n' +
    '3. Create a channel called `announcements` - this is where the bot will post time warnings and list the top/active streakers\n\n' +
    '4. Setup the channels users can start streaks in. Use: `!setchannels channel1, channel2, channel3, etc` or `!setchannels *`\n\n' +
    'You can use the command `!checksetup` to verify your settings. Once all that\'s done, feel free to delete this channel.\n' +
    '*Tip: use the `!help` command to list all the available commands.*')
  }).catch(error => {
    console.log(error)
  })
})

client.login(process.env.BOT_SECRET)

const handleStreak = msg => {
  if(isValidStreakMessage(msg)) {
    db.addStreak(msg)

    const streak = db.getUserStreak(msg.author.id, msg.guild.id, msg)
    if (streak) {
      bot.assignActiveStreakRole(msg.guild, msg.author.id)
      msg.reply(`nice one! Your ${streak.topic} streak is now ${streak.streakLevel} ${streak.streakLevel === 1 ? 'day' : 'days'}!`)
      msg.react('🔥')
    }
  }
}

const isValidStreakMessage = msg => {
  if(!msg.content.includes(' ')) {
    msg.reply('you can start a streak by using !streak [#topic (optional)] [what you did]`. You need to supply a small description of the work in your message for it to count')
    return false
  }

  if(!db.isValidChannel(msg.guild.id, msg.channel.name)) {
    msg.reply('you can\'t make any progress in this channel!')
    return false
  }

  if(db.hasStreakedToday(msg.guild.id, msg.author.id, msg)) {
    msg.reply('you\'ve already made progress in this streak today!')
    return false
  }

  if(msg.content.length < '!streak'.length + 20) {
    msg.reply('you need to be more descriptive about this progress for it to count.')
    return false
  }

  const topic = topics.getTopicOrChannel(msg)
  if(topic.length === 1) {
    msg.reply('that isn\'t a valid topic.')
    return false
  }

  return true
}

const messageCurrentStreaks = msg => {
  const streaks = db.getUserActiveStreaks(msg.author.id)

  if(streaks.length === 0) {
    msg.reply('You currently have no active streaks. Use !streak (with an optional #topic) in a channel to start one 🔥')
  } else {
    msg.reply(`${msg.guild ? `here` : `Here`} are your active streaks: \n\n` + streaks.map(streak => {
      const hasStreakedToday = db.hasStreakedToday(streak.guildID, msg.author.id, {
        // hasStreakedToday requires a message with a topic in it which we can't provide
        channel: {
          name: streak.topic.split('#')[1]
        }
      })
      let postedString = 'but you haven\'t increased your streak yet today 😟'
      if(hasStreakedToday) postedString = 'and you\'ve increased your streak today 👍'
      return `Your *${streak.topic}* streak is currently ${streak.streakLevel} ${streak.streakLevel === 1 ? 'day' : 'days'} ${postedString}`
    }).join('\n'))
  }
}

const messageTimeLeft = msg => {
  const diff = differenceInHours(startOfTomorrow(), new Date())
  if(diff <= 1) {
    msg.reply(`there is under an hour left to continue a streak ⏳`)
  } else {
    msg.reply(`there are ${diff} hours left to continue a streak ⏰`)
  }
}

const messageStats = async msg => {
  if(!msg.guild) {
    msg.reply(`You can't do that here, you can only run that command in a server.`)
    return
  }

  const users = db.getStatCount('users')
  const streaks = db.getStatCount('streaks')

  const highscores = db.getTopAllTimeStreaks(msg.guild.id)
  let topStreaks = []

  for(let highscore of highscores) {
    const user = await client.users.fetch(highscore.userID)
    if(user) {
      topStreaks.push(`**${user.username}** for *${highscore.topic}* with ${highscore.bestStreak} ${highscore.streakLevel === 1 ? 'day' : 'days'}!`)
    }
  }

  topStreaks = topStreaks.map((streak, index) => {
    return `${index+1}. ${streak}`
  })

  const firstStreakDate = db.getFirstStreakDate(msg.guild.id)
  if(!firstStreakDate) {
    msg.reply('no one has started a streak in this server yet, why not be the first?')
    return
  }

  msg.reply(`so far ${users} users have used StreakBot and there have been ${streaks} streak updates dating back to ${firstStreakDate} \n` +
    `👑 Here are the top 10 best streaks of all time:\n` +
    `${topStreaks.slice(0, 9).join('\n')}`
  )
}

const messageHelp = msg => {
  msg.reply('here\'s a list of commands you can use: \n\n' +
    '**Streaks**\n' + 
    '`!streak [#topic (optional)] [what you did]` - start or continue a streak for your chosen topic. You need to supply a small description of the work in your message for it to count\n\n' + 
    '`!mystreaks` - show all your current streaks\n\n' + 
    '`!showstreaks` - show all streaks for this channel\n\n' +
    '**Global**\n' +
    '`!timeleft` - show how long is left until the streak cut-off time\n\n' + 
    '`!stats` - show a few useful stats\n\n' +
    '`!toggledm` - toggle direct messages for when your streak ends\n\n' + 
    '`!togglementions` - toggle the bot mentioning you in announcements\n\n' +
    '`!showactivestreaks` - show all active streaks for all channels\n\n' +
    '**Admin**\n' +
    '`!setrole [top/active] [role name/id]` - set which role is the active streaks role or the top streaker role\n\n' +
    '`!setchannels channel1, channel2, channel3, etc` - set which channels streaks can be built up in using a comma-separated list or use `*` to specify all channels\n\n' +
    '`!checksetup` - show a checklist of settings required to use StreakBot')
}

const messageAllStreaksForChannel = async msg => {
  const channel = msg.channel

  if(!channel.guild) {
    channel.send(`You can't do that here, you can only run that command in a channel.`)
    return
  }

  if(!db.isValidChannel(channel.guild.id, channel.name)) {
    msg.reply('you can\'t make any progress in this channel!')
    return
  }

  let streaks = db.getActiveStreaksForChannel(channel.guild.id, channel.name)
  if(streaks.length === 0) {
    msg.reply(`there are currently no streaks in this for #${channel.name} 😞. Why not change that?`)
    return
  }

  streaks = streaks.sort((a, b) => {
    return b.streakLevel - a.streakLevel
  })

  streaks = await Promise.all(streaks.map(async streak => {
    const user = await client.users.fetch(streak.userID)
    return `**${user.username}** with ${streak.streakLevel} ${streak.streakLevel === 1 ? 'day' : 'days'}`
  }))

  msg.reply(`here are all the active streaks in *${channel.name}*:\n\n` + streaks.join('\n'))
}

const messageAllActiveStreaks = async msg => {
  if(!msg.guild) {
    msg.reply(`You can't do that here, you can only run that command in a server.`)
    return
  }

  const streaks = db.getActiveStreaks(msg.guild.id)
  if(streaks.length === 0) {
    msg.reply(`there are currently no active streaks. Use \`!streak [#topic (optional)] [what you did]\` to start a streak for your chosen topic!`)
  } else {
    msg.reply(`here are all the active streaks:\n\n` + (await bot.buildActiveStreaksMessage(msg.guild.id)))
  }
}

const messageSetupChecklist = msg => {
  if(!msg.guild) {
    msg.reply(`You can't do that here, you can only run that command in a server.`)
    return
  }

  const hasTopRole = Boolean(db.getRole(msg.guild.id, 'top'))
  const hasActiveRole = Boolean(db.getRole(msg.guild.id, 'active'))
  const hasAnnouncementsChannel = Boolean(msg.guild.channels.find(c => c.name === "announcements"))
  const hasStreakChannels = Boolean(db.getChannels(msg.guild.id).length > 0)

  msg.channel.send(hasTopRole ? '✅ The server has a top streak role' : '❌ The server does not have a top streak role')
  msg.channel.send(hasActiveRole ? '✅ The server has an active streak role' : '❌ The server does not have an active streak role')
  msg.channel.send(hasAnnouncementsChannel ? '✅ The server has an announcements channel' : '❌ The server does not have an announcements channel')
  msg.channel.send(hasStreakChannels ? '✅ The server has at least one streak channel' : '❌ The server does not have any streak channels')
}
