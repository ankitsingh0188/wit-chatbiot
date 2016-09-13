'use strict';

// Messenger API integration example
// We assume you have:
// * a Wit.ai bot setup (https://wit.ai/docs/quickstart)
// * a Messenger Platform setup (https://developers.facebook.com/docs/messenger-platform/quickstart)
// You need to `npm install` the following dependencies: body-parser, express, request.
//
// 1. npm install body-parser express request
// 2. Download and install ngrok from https://ngrok.com/download
// 3. ./ngrok http 8445
// 4. WIT_TOKEN=your_access_token FB_APP_SECRET=your_app_secret FB_PAGE_TOKEN=your_page_token node examples/messenger.js
// 5. Subscribe your page to the Webhooks using verify_token and `https://<your_ngrok_io>/webhook` as callback URL.
// 6. Talk to your bot on Messenger!

const bodyParser = require('body-parser');
const crypto = require('crypto');
const express = require('express');
const fetch = require('node-fetch');
const request = require('request');

let Wit = null;
let log = null;
try {
  // if running from repo
  Wit = require('../').Wit;
  log = require('../').log;
} catch (e) {
  Wit = require('node-wit').Wit;
  log = require('node-wit').log;
}
const {
  DEFAULT_WIT_TOKEN,
  DEFAULT_FB_PAGE_TOKEN,
  DEFAULT_FB_APP_SECRET
} = require('../lib/config');
// Webserver parameter
const PORT = process.env.PORT || 8445;

// Wit.ai parameters
// const WIT_TOKEN = process.env.WIT_TOKEN;
// const WIT_TOKEN = 'RWDHGOPJJ4DI4WZF7KHQE3T3ZIL7DB33';
const WIT_TOKEN = DEFAULT_WIT_TOKEN;

// Messenger API parameters
// const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN;
const FB_PAGE_TOKEN = DEFAULT_FB_PAGE_TOKEN;
// const FB_PAGE_TOKEN = 'EAAWbRYxNjOEBACU0vco42PqejFIVLQZB88Fqbm007LZAOnHQIdWmZBW1h6v2ZAo928cNkDCjhypH6mALB5FwZAHu8G7t8ZBVgZAje8t52RHO8FFdjBmBhHZCxPx0qUPJz86ee5h3HM37Dcu931QocTSxxj1mpPT46sqU9fZB1tZCExHgZDZD';
if (!FB_PAGE_TOKEN) { throw new Error('missing FB_PAGE_TOKEN') }
// const FB_APP_SECRET = process.env.FB_APP_SECRET;
const FB_APP_SECRET = DEFAULT_FB_APP_SECRET;
// const FB_APP_SECRET = 'c2bf2848adffe996cd6314e64b49ca1c';
if (!FB_APP_SECRET) { throw new Error('missing FB_APP_SECRET') }

let FB_VERIFY_TOKEN = null;
crypto.randomBytes(8, (err, buff) => {
  if (err) throw err;
  // FB_VERIFY_TOKEN = buff.toString('hex');
  FB_VERIFY_TOKEN = 'b1683709bb35b5zx';
  console.log(`/webhook will accept the Verify Token "${FB_VERIFY_TOKEN}"`);
});

// ----------------------------------------------------------------------------
// Messenger API specific code

// See the Send API reference
// https://developers.facebook.com/docs/messenger-platform/send-api-reference


// OLD Facebook Code
const fbMessage = (id, text) => {
  const body = JSON.stringify({
    recipient: { id },
    message: { text },
  });
  const qs = 'access_token=' + encodeURIComponent(FB_PAGE_TOKEN);
  return fetch('https://graph.facebook.com/me/messages?' + qs, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body,
  })
  .then(rsp => rsp.json())
  .then(json => {
    if (json.error && json.error.message) {
      throw new Error(json.error.message);
    }
    return json;
  });
};


// ------------- New Facebook Code ---------------

// const fbMessage = (id, msg, attachment) => {
//   var facebook_message = {
//       recipient: {},
//       message: {}
//   };
//   if (attachment) {
//     facebook_message.message.attachment = msg;
//   } else {
//     facebook_message.message.text = msg;
//   }
//   facebook_message.recipient.id = id;
//   // body = {
//   //   recipient: { id },
//   //   message: message,
//   // };
//   facebook_message.access_token = FB_PAGE_TOKEN;
//   request({
//       method: "POST",
//       json: true,
//       headers: {
//           "content-type": "application/json",
//       },
//       body: facebook_message,
//       uri: 'https://graph.facebook.com/v2.6/me/messages'
//   }, function(err, res, body) {
//   });
// };

// ------------- Facebook code ends ------------

// ----------------------------------------------------------------------------
// Wit.ai bot specific code

// This will contain all user sessions.
// Each session has an entry:
// sessionId -> {fbid: facebookUserId, context: sessionState}
const sessions = {};

const findOrCreateSession = (fbid) => {
  let sessionId;
  // Let's see if we already have a session for the user fbid
  Object.keys(sessions).forEach(k => {
    if (sessions[k].fbid === fbid) {
      // Yep, got it!
      sessionId = k;
    }
  });
  if (!sessionId) {
    // No session found for user fbid, let's create a new one
    sessionId = new Date().toISOString();
    sessions[sessionId] = {fbid: fbid, context: {}};
  }
  return sessionId;
};

const firstEntityValue = (entities, entity) => {
  const val = entities && entities[entity] &&
    Array.isArray(entities[entity]) &&
    entities[entity].length > 0 &&
    entities[entity][0].value
  ;
  if (!val) {
    return null;
  }
  return typeof val === 'object' ? val.value : val;
};

// Our bot actions
const actions = {
  send({sessionId}, {text}) {
    // Our bot has something to say!
    // Let's retrieve the Facebook user whose session belongs to
    const recipientId = sessions[sessionId].fbid;
    if (recipientId) {
      // Yay, we found our recipient!
      // Let's forward our bot response to her.
      // We return a promise to let our bot know when we're done sending
      return fbMessage(recipientId, text, true)
      .then(() => null)
      .catch((err) => {
        console.error(
          'Oops! An error occurred while forwarding the response to',
          recipientId,
          ':',
          err.stack || err
        );
      });
    } else {
      console.error('Oops! Couldn\'t find user for session:', sessionId);
      // Giving the wheel back to our bot
      return Promise.resolve()
    }
  },

  getForecast({context, entities}) {
    delete context.forecast
    return new Promise(function(resolve, reject) {      
    // Retrive the location entity and store it in the context field
    var loc = firstEntityValue(entities, 'location')
    if (loc) {
      getWeather(loc)
       .then(function (forecast) {
         context.loc = forecast || 'sunny';
         return resolve(context);
       })
       .catch(function (err) {
         console.log(err)
    })       
    return resolve(context);
    }
    });
  },

   howzyou({context, entities}) {
    return new Promise(function(resolve, reject) {
      var howzyou = firstEntityValue(entities, 'howzyou');
      if(howzyou) {
        context.howz = howzyou;
      }
       return resolve(context);
    });
  },


  // readingBooks({context, entities}) {
  //   return new Promise(function(resolve, reject) {
  //     var reading = firstEntityValue(entities, 'reading');
  //     if(reading) {      
  //       // context.readbook = reading;
  //       const jokes = allJokes[context.readbook || 'default'];
  //       context.joke = jokes[Math.floor(Math.random() * jokes.length)];
  //     }
  //      return resolve(context);
  //   });
  // },

  // ['fetch-pics'](context) {
  //   return new Promise(function(resolve, reject) {
  //     var wantedPics = allPics[context.cat || 'default'];
  //     context.pics = wantedPics[Math.floor(Math.random() * wantedPics.length)];
  //     return resolve(context);
  //   });
  // },

  ['what-to-read'](context) {
    return new Promise(function(resolve, reject) {
      return resolve(context);
    });
  },

  // ['fetch-weather'](context) {
  //   return new Promise(function(resolve, reject) {
  //   if(context.loc) {
  //      return resolve(context);
  //     }     
  //   });
  // }
};


  var getWeather = function (location) {
  return new Promise(function (resolve, reject) {
    var url = 'https://query.yahooapis.com/v1/public/yql?q=select%20*%20from%20weather.forecast%20where%20woeid%20in%20(select%20woeid%20from%20geo.places(1)%20where%20text%3D%22'+ location +'%22)&format=json&env=store%3A%2F%2Fdatatables.org%2Falltableswithkeys'
    request(url, function (error, response, body) {
        if (!error && response.statusCode == 200) {
          var jsonData = JSON.parse(body)
          var forecast = jsonData.query.results.channel.item.forecast[0].text
          console.log('WEATHER API SAYS....', jsonData.query.results.channel.item.forecast[0].text)
          return forecast
        }
      })
  })
}

// Setting up our bot
const wit = new Wit({
  accessToken: WIT_TOKEN,
  actions,
  logger: new log.Logger(log.INFO)
});

// Starting our webserver and putting it all together
const app = express();
app.use(({method, url}, rsp, next) => {
  rsp.on('finish', () => {
    console.log(`${rsp.statusCode} ${method} ${url}`);
  });
  next();
});
app.use(bodyParser.json({ verify: verifyRequestSignature }));

// Webhook setup
app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === FB_VERIFY_TOKEN) {
    res.send(req.query['hub.challenge']);
  } else {
    res.sendStatus(400);
  }
});

// Message handler
app.post('/webhook', (req, res) => {
  // Parse the Messenger payload
  // See the Webhook reference
  // https://developers.facebook.com/docs/messenger-platform/webhook-reference
  const data = req.body;

  if (data.object === 'page') {
    data.entry.forEach(entry => {
      entry.messaging.forEach(event => {
        if (event.message) {
          // Yay! We got a new message!
          // We retrieve the Facebook user ID of the sender
          const sender = event.sender.id;

          // We retrieve the user's current session, or create one if it doesn't exist
          // This is needed for our bot to figure out the conversation history
          const sessionId = findOrCreateSession(sender);

          // We retrieve the message content
          const {text, attachments} = event.message;

          if (attachments) {
            // We received an attachment
            // Let's reply with an automatic message
            // fbMessage(sender, 'Sorry I can only process text messages for now.')
            fbMessage(sender, 'Sorry I can only process text messages for now.')
            .catch(console.error);
          } else if (text) {
            // We received a text message

            // Let's forward the message to the Wit.ai Bot Engine
            // This will run all actions until our bot has nothing left to do
            wit.runActions(
              sessionId, // the user's current session
              text, // the user's message
              sessions[sessionId].context // the user's current session state
            ).then((context) => {
              // Our bot did everything it has to do.
              // Now it's waiting for further messages to proceed.
              console.log('Waiting for next user messages');

              // Based on the session state, you might want to reset the session.
              // This depends heavily on the business logic of your bot.
              // Example:
              // if (context['done']) {
              //   delete sessions[sessionId];
              // }

              // Updating the user's current session state
              sessions[sessionId].context = context;
            })
            .catch((err) => {
              console.error('Oops! Got an error from Wit: ', err.stack || err);
            })
          }
        } else {
          console.log('received event', JSON.stringify(event));
        }
      });
    });
  }
  res.sendStatus(200);
});

/*
 * Verify that the callback came from Facebook. Using the App Secret from
 * the App Dashboard, we can verify the signature that is sent with each
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
function verifyRequestSignature(req, res, buf) {
  var signature = req.headers["x-hub-signature"];

  if (!signature) {
    // For testing, let's log an error. In production, you should throw an
    // error.
    console.error("Couldn't validate the signature.");
  } else {
    var elements = signature.split('=');
    var method = elements[0];
    var signatureHash = elements[1];

    var expectedHash = crypto.createHmac('sha1', FB_APP_SECRET)
                        .update(buf)
                        .digest('hex');

    if (signatureHash != expectedHash) {
      throw new Error("Couldn't validate the request signature.");
    }
  }
}

app.listen(PORT);
console.log('Listening on :' + PORT + '...');


// app.post('/webhook', function (req, res) {
//   var data = req.body;

//   // Make sure this is a page subscription
//   if (data.object == 'page') {
//     // Iterate over each entry
//     // There may be multiple if batched
//     data.entry.forEach(function(pageEntry) {
//       var pageID = pageEntry.id;
//       var timeOfEvent = pageEntry.time;

//       // Iterate over each messaging event
//       pageEntry.messaging.forEach(function(messagingEvent) {
//         if (messagingEvent.optin) {
//           receivedAuthentication(messagingEvent);
//         } else if (messagingEvent.message) {
//           receivedMessage(messagingEvent);
//         } else if (messagingEvent.delivery) {
//           receivedDeliveryConfirmation(messagingEvent);
//         } else if (messagingEvent.postback) {
//           receivedPostback(messagingEvent);
//         } else {
//           console.log("Webhook received unknown messagingEvent: ", messagingEvent);
//         }
//       });
//     });

//     // Assume all went well.
//     //
//     // You must send back a 200, within 20 seconds, to let us know you've 
//     // successfully received the callback. Otherwise, the request will time out.
//     res.sendStatus(200);
//   }
// });

// function receivedMessage(event) {
//   var senderID = event.sender.id;
//   var recipientID = event.recipient.id;
//   var timeOfMessage = event.timestamp;
//   var message = event.message;

//   console.log("Received message for user %d and page %d at %d with message:", 
//     senderID, recipientID, timeOfMessage);
//   console.log(JSON.stringify(message));

//   var messageId = message.mid;

//   // You may get a text or attachment but not both
//   var messageText = message.text;
//   var messageAttachments = message.attachments;

//   if (messageText) {

//     // If we receive a text message, check to see if it matches any special
//     // keywords and send back the corresponding example. Otherwise, just echo
//     // the text we received.
//     switch (messageText) {
//       case 'image':
//         sendImageMessage(senderID);
//         break;

//       case 'button':
//         sendButtonMessage(senderID);
//         break;

//       case 'generic':
//         sendGenericMessage(senderID);
//         break;

//       case 'receipt':
//         sendReceiptMessage(senderID);
//         break;

//       default:
//         sendTextMessage(senderID, messageText);
//     }
//   } else if (messageAttachments) {
//     sendTextMessage(senderID, "Message with attachment received");
//   }
// }

// function sendTextMessage(recipientId, messageText) {
//   var messageData = {
//     recipient: {
//       id: recipientId
//     },
//     message: {
//       text: messageText
//     }
//   };

//   callSendAPI(messageData);
// }

// function callSendAPI(messageData) {
//   request({
//     uri: 'https://graph.facebook.com/v2.6/me/messages',
//     qs: { access_token: PAGE_ACCESS_TOKEN },
//     method: 'POST',
//     json: messageData

//   }, function (error, response, body) {
//     if (!error && response.statusCode == 200) {
//       var recipientId = body.recipient_id;
//       var messageId = body.message_id;

//       console.log("Successfully sent generic message with id %s to recipient %s", 
//         messageId, recipientId);
//     } else {
//       console.error("Unable to send message.");
//       console.error(response);
//       console.error(error);
//     }
//   });  
// }
