const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

// Enable logging
const log4js = require('log4js');
log4js.configure({
  appenders: { file: { type: 'file', filename: 'bot.log' } },
  categories: { default: { appenders: ['file'], level: 'info' } }
});
const logger = log4js.getLogger('bot');

// Token
const token = '7288330417:AAFcIwdAAPe90LGQ918Ao5NIPEmA8LLF9kE';

// Create a bot
const bot = new TelegramBot(token, { polling: true });

// Prices dictionary
const PRICES = {
  'Top 3 Guarantee': {
    '3 hours': '5.6',
    '6 hours': '9.92',
    '12 hours': '17.92',
    '24 hours': '29.92'
  },
  'Top 8 Guarantee': {
    '3 hours': '4.65',
    '6 hours': '8.37',
    '12 hours': '14.48',
    '24 hours': '25.92'
  },
  'Any position': {
    '3 hours': '3.85',
    '6 hours': '6.93',
    '12 hours': '12.32',
    '24 hours': '21.56'
  }
};

// Conversation states
const STATES = {
  SELECTING_CHAIN: 'SELECTING_CHAIN',
  TYPING_TOKEN: 'TYPING_TOKEN',
  TYPING_PORTAL: 'TYPING_PORTAL',
  SELECTING_SLOT: 'SELECTING_SLOT',
  SELECTING_PERIOD: 'SELECTING_PERIOD',
  CONFIRMING_ORDER: 'CONFIRMING_ORDER'
};

// User data storage
let userData = {};

// Start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const opts = {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'ETH', callback_data: 'ETH' }],
        [{ text: 'BNB', callback_data: 'BNB' }],
        [{ text: 'SOL', callback_data: 'SOL' }]
      ]
    }
  };
  bot.sendMessage(chatId, 'Select chain:', opts).then((sentMessage) => {
    userData[chatId] = { state: STATES.SELECTING_CHAIN, lastMessageId: sentMessage.message_id };
    logger.info("Received /start command");
  });
});

// Edit message helper function
const editMessage = (chatId, messageId, text, opts) => {
  bot.editMessageText(text, {
    chat_id: chatId,
    message_id: messageId,
    ...opts
  }).catch(err => console.log(err));
};

// Callback query handler
bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const data = callbackQuery.data;

  if (!userData[chatId]) {
    userData[chatId] = { state: STATES.SELECTING_CHAIN };
  }

  if (userData[chatId].state === STATES.SELECTING_CHAIN) {
    userData[chatId].chain = data;
    userData[chatId].state = STATES.TYPING_TOKEN;
    editMessage(chatId, messageId, 'Send me token address.');
    logger.info(`Chain selected: ${data}`);
  } else if (userData[chatId].state === STATES.SELECTING_SLOT) {
    if (data === 'Fast-Track') {
      userData[chatId].order = data;
      userData[chatId].state = STATES.TYPING_PORTAL;
      editMessage(chatId, messageId, '❔ Send me portal/group link.');
      logger.info(`Order selected: ${data}`);
    } else {
      userData[chatId].slot = data;
      userData[chatId].state = STATES.SELECTING_PERIOD;
      const opts = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '3 hours', callback_data: '3 hours' },
             { text: '6 hours | -10%', callback_data: '6 hours' }],
            [{ text: '12 hours | -20%', callback_data: '12 hours' },
             { text: '24 hours | -30%', callback_data: '24 hours' }]
          ]
        }
      };
      editMessage(chatId, messageId, '❔ Select period:', opts);
      logger.info(`Slot selected: ${data}`);
    }
  } else if (userData[chatId].state === STATES.SELECTING_PERIOD) {
    userData[chatId].period = data;
    userData[chatId].state = STATES.CONFIRMING_ORDER;
    const { chain, token_address, portal_link, slot, period } = userData[chatId];
    const price = PRICES[slot][period];

    const confirmationMessage = `
<b>Confirm your order:</b>

<b>Token Address:</b> <b>${token_address}</b>
<b>Chain:</b> <b>${chain}</b>
<b>Portal:</b> <b>${portal_link}</b>
<b>Time:</b> <b>${period}</b>
<b>Top:</b> <b>${slot}</b>
<b>Price:</b> <b>${price} SOL</b>

Be sure to read full message before you continue, by clicking "✅ Confirm" button below you also confirm that you understand and accept rules:
1. Deluge.Cash team can remove your token from the trending list with no chance of a refund if they suspect a scam in your token (ex.: sell tax 99%, developer mints a lot of tokens, liquidity removal and etc.) or abandoned project or lack of telegram group moderation or false information or deception or NSFW content in group or any place where links in channel/group leads to including "portals" to group.
2. You must ensure that your advertisement, links to channels or groups you provide and any related materials posted, distributed or linked to in a group or channel you provide do not provide false information, deception, sexual or any NSFW (Not Safe For Work) content. This includes, but is not limited to, any material that is pornographic, sexually explicit, or otherwise inappropriate for a general audience.
3. You are forbidden from including or linking to pornography, sexually explicit images, videos, or other materials, whether real or simulated, in your advertisement.
4. You must avoid including sexually suggestive content in your advertisement, including images, videos, text, and any other forms of media intended to arouse.
5. You must ensure that your advertisement do not involve scams or fraudulent schemes intended to deceive others for financial gain or other benefits.
6. If suspicious activity in the form of "farming" (developers keeping more than 14%, splitting wallets) is noticed and according to the Deluge.Cash team it may be a threat, your token will be removed from trending list, refund is not available.
7. You should also realize that the position in the trending list has NO IMPACT on the chances of sending a buy in the trending channel, chances of sending buy to channel: ~25% for buys >10$ if @buybot setted up in group.
8. For violation of any of the above rules your token will be removed from trending list, refund is not available.
9. Refund can be made only in case of full service disruption (stop updating trending list and your token not in the list and full stop displaying buys in the channel) more than 20 minutes straight and to the address of the wallet from which the payment was made to the address for payment, do NOT send payment from exchanges or wallets to which you do not have access because you will not be refunded, use only your personal wallet to which you will always have access.
`;
    const opts = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Confirm', callback_data: 'confirm_order' }],
          [{ text: '🔄 Cancel and start over', callback_data: 'cancel_and_start_over' }]
        ]
      },
      parse_mode: 'HTML'
    };
    editMessage(chatId, messageId, confirmationMessage, opts);
    logger.info(`Period selected: ${data}`);
  } else if (data === 'confirm_order') {
    const { token_address, chain, portal_link, slot, period } = userData[chatId];
    const price = PRICES[slot][period];
    logger.info(`Order confirmed: Token Address: ${token_address}, Chain: ${chain}, Portal: ${portal_link}, Slot: ${slot}, Period: ${period}, Price: ${price}`);

    const paymentInformation = `
❔ <b>Payment Information:</b>

⤵️<b> Always double-check that you have entered the correct address before sending.</b>
<b>Address:</b> <code>G2XNkLGnHeFTCj5Eb328t49aV2xL3rYmrwugg4n3BPHm</code>
<b>Amount:</b> <code>${price}</code><b> SOL</b>

<b>After the transfer, click the button below. You can transfer the rest if you haven't transferred enough.</b>

<b>To cancel the payment and start over, use /delete.</b>
`;
    const opts = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Check payment', callback_data: 'check_payment' }]
        ]
      },
      parse_mode: 'HTML'
    };
    editMessage(chatId, messageId, paymentInformation, opts);
  } else if (data === 'check_payment') {
    bot.sendMessage(chatId, '❗️ Payment Not Received.');
    logger.info('Payment check executed: Payment Not Received.');
  } else if (data === 'cancel_and_start_over') {
    userData[chatId] = { state: STATES.SELECTING_CHAIN, lastMessageId: messageId };
    const opts = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'ETH', callback_data: 'ETH' }],
          [{ text: 'BNB', callback_data: 'BNB' }],
          [{ text: 'SOL', callback_data: 'SOL' }]
        ]
      }
    };
    editMessage(chatId, messageId, 'Order cancelled. Starting over.', opts);
    logger.info('Order cancelled and starting over.');
  } else if (data === 'confirm_delete') {
    const deleteMessageId = userData[chatId].deleteMessageId || messageId;
    delete userData[chatId]; // Clear user data
    const opts = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'ETH', callback_data: 'ETH' }],
          [{ text: 'BNB', callback_data: 'BNB' }],
          [{ text: 'SOL', callback_data: 'SOL' }]
        ]
      }
    };
    editMessage(chatId, deleteMessageId, 'Select chain:', opts);
    logger.info('All configuration data has been deleted.');
  } else if (data === 'cancel_delete') {
    bot.sendMessage(chatId, 'Deletion cancelled.');
    logger.info('Deletion cancelled.');
  }
});

// Token address handler
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Ensure the message is not from the bot itself
  if (msg.from.is_bot) return;

  if (userData[chatId] && userData[chatId].state === STATES.TYPING_TOKEN) {
    userData[chatId].token_address = text;
    userData[chatId].state = STATES.SELECTING_SLOT;
    const opts = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Trending Fast-Track', callback_data: 'Fast-Track' }]
        ]
      }
    };
    bot.sendMessage(chatId, 'What do you want to order?', opts).then((sentMessage) => {
      userData[chatId].lastMessageId = sentMessage.message_id;
    });
    logger.info(`Token address received: ${text}`);
  } else if (userData[chatId] && userData[chatId].state === STATES.TYPING_PORTAL) {
    const telegramLinkPattern = /(https?:\/\/)?(www\.)?(t\.me|telegram\.me)\/[a-zA-Z0-9_]+/;
    if (telegramLinkPattern.test(text)) {
      userData[chatId].portal_link = text;
      userData[chatId].state = STATES.SELECTING_SLOT;
      const opts = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🟢 Top 3 Guarantee', callback_data: 'Top 3 Guarantee' },
             { text: '🔴 Top 8 Guarantee', callback_data: 'Top 8 Guarantee' }],
            [{ text: '🟢 Any position', callback_data: 'Any position' }]
          ]
        }
      };
      bot.sendMessage(chatId, 'ℹ Select open slot or click to see the nearest potential availability time:', opts).then((sentMessage) => {
        userData[chatId].lastMessageId = sentMessage.message_id;
      });
      logger.info(`Portal link received: ${text}`);
    } else {
      bot.sendMessage(chatId, '❗️ Incorrect portal or group link. Please send a correct Telegram group link.').then((sentMessage) => {
        userData[chatId].lastMessageId = sentMessage.message_id;
      });
      logger.warning('Incorrect portal or group link received');
      // Keep the state to TYPING_PORTAL so that the user can re-enter the link
    }
  }
});

// Delete command handler
bot.onText(/\/delete/, (msg) => {
  const chatId = msg.chat.id;
  const opts = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "✅ Yes, I'm sure", callback_data: 'confirm_delete' }],
        [{ text: '❗️ No', callback_data: 'cancel_delete' }]
      ]
    }
  };
  bot.sendMessage(chatId, 'Are you sure to delete all configuration data?\nDo not do this if you have paid or are about to pay for this configuration, as a new payment wallet will be generated next time!', opts).then((sentMessage) => {
    if (!userData[chatId]) {
      userData[chatId] = {};
    }
    userData[chatId].deleteMessageId = sentMessage.message_id;
  });
});

// Create Express app
const app = express();
app.use(bodyParser.json());

// Set webhook
app.post('/webhook', (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get('/', (req, res) => {
  res.send('Hello World!');
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  logger.info(`Express app listening on port ${port}`);
  bot.setWebHook(`https://finale-kysy.onrender.com/webhook`);
});
