#!/usr/bin/env node

const TelegramBot = require('node-telegram-bot-api');
const toArray = require('stream-to-array');
const FormData = require('form-data');
const fetch = require('node-fetch');
const express = require('express');
const chalk = require('chalk');
const fs = require('fs');

const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.send('Bot Sedang Berjalan!');
});

app.listen(port, () => {
  console.log(chalk.green(`Bot Sedang Berjalan Pada Port ${port}`));
});

const settings = JSON.parse(fs.readFileSync('settings.json', 'utf-8'));

const uploadByUrl = async (url, agent) => {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Terjadi kesalahan: ${res.status} ${res.statusText}`);
    }
    if (!(res.body instanceof stream.Stream)) {
      throw new TypeError('Respons bukan aliran');
    }
    const array = await toArray(res.body);
    const buffer = Buffer.concat(array);

    if (!res.headers.get('content-type')) {
      throw new Error('Tidak ada tipe konten dalam respons');
    }

    return uploadByBuffer(buffer, res.headers.get('content-type'), agent);
  } catch (err) {
    throw err;
  }
};

const uploadByBuffer = async (buffer, contentType, agent) => {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError('Buffer bukan Buffer');
  }
  
  const form = new FormData();
  form.append('photo', buffer, {
    filename: 'blob',
    contentType,
    ...agent && { agent },
  });
  
  try {
    const res = await fetch('https://telegra.ph/upload', {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      throw new Error(`Terjadi kesalahan: ${res.status} ${res.statusText}`);
    }
    const result = await res.json();
    if (result.error) {
      throw result.error;
    }

    if (result[0] && result[0].src) {
      return {
        link: 'https://telegra.ph' + result[0].src,
        path: result[0].src,
      };
    }
    throw new Error('Kesalahan tidak diketahui');
  } catch (err) {
    throw err;
  }
};

const bot = new TelegramBot(settings.telegramBotToken, { polling: true });

bot.setMyCommands([
  {
    command: '/start',
    description: 'Mulai Percakapan Baru',
  },
  {
    command: '/runtime',
    description: 'Cek Waktu Aktif Bot',
  },
]);

let startTime = new Date();

function calculateUptime() {
  const now = new Date();
  const ms = now - startTime;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  return { days, hours: hours % 24, minutes: minutes % 60, seconds: seconds % 60 };
}

bot.on('message', async (msg) => {
  try {
    if (msg.photo) {
      bot.sendChatAction(msg.chat.id, 'typing');
      const fileId = msg.photo[msg.photo.length - 1].file_id;
      const file = await bot.getFile(fileId);
      const fileLink = await bot.getFileLink(fileId);
      const buffer = await fetch(fileLink).then(res => res.buffer());
      const result = await uploadByBuffer(buffer, 'image/png');
      bot.sendMessage(msg.chat.id, `Link Gambar Yang Anda Unggah:\n${result.link}`);
    } else if (msg.text === '/runtime') {
      const uptime = calculateUptime();
      bot.sendMessage(msg.chat.id, `Bot Telah Aktif Selama:\n${uptime.days} hari, ${uptime.hours} jam, ${uptime.minutes} menit, ${uptime.seconds} detik.`);
    } else if (msg.text === '/start') {
      bot.sendMessage(msg.chat.id, `Halo ${msg.from.first_name} 👋\nSaya adalah bot yang dapat mengunggah gambar ke telegra.ph dan mengirimkan link hasilnya kepada anda!`);
    } else {
      bot.sendMessage(msg.chat.id, 'Maaf, Anda Belum Mengirim Gambar!');
    }
  } catch (err) {
    console.error(err);
    bot.sendMessage(msg.chat.id, 'Maaf, Terjadi Kesalahan Saat Mengunggah Gambar.');
  }
});