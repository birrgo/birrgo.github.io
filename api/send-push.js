const admin = require('firebase-admin');

// Initialize Firebase Admin safely (Singleton pattern for Vercel execution environment)
if (!admin.apps.length && process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });
    console.log("Firebase Admin initialized successfully.");
  } catch (err) {
    console.error("Firebase Admin initialization error:", err);
  }
}

module.exports = async (req, res) => {
  // Always return application/json
  res.setHeader('Content-Type', 'application/json');

  // 1. Configure CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed. Use POST.' });
  }

  try {
    const body = req.body || {};
    const { title, message, segments, url, imageUrl } = body;

    if (!title || !message) {
      return res.status(400).json({ success: false, error: 'Notification title and message are required.' });
    }

    // Check environment variables first
    let appId = process.env.ONESIGNAL_APP_ID;
    let restApiKey = process.env.ONESIGNAL_REST_KEY || process.env.ONESIGNAL_REST_API_KEY;

    // Fetch dynamic config from Firebase Realtime DB if env vars are missing
    if ((!appId || !restApiKey) && admin.apps.length) {
      try {
        const db = admin.database();
        const configSnapshot = await db.ref('config/onesignal').once('value');
        const configData = configSnapshot.val();

        if (configData) {
          if (configData.appId) appId = configData.appId;
          if (configData.restApiKey) restApiKey = configData.restApiKey;
        }
      } catch (dbErr) {
        console.error("Failed to read OneSignal config from Firebase:", dbErr.message);
      }
    }

    if (!appId || !restApiKey) {
      console.error("Missing OneSignal Credentials");
      return res.status(500).json({ 
        success: false, 
        error: 'OneSignal credentials (APP ID or REST KEY) are missing on server.' 
      });
    }

    // Target segments setup (Use single reliable segment fallback)
    const targetSegments = (Array.isArray(segments) && segments.length > 0)
      ? segments
      : ['Total Subscriptions'];

    // Construct OneSignal Payload
    const notificationPayload = {
      app_id: appId,
      headings: { en: title },
      contents: { en: message },
      included_segments: targetSegments,
      url: url || 'https://birrgo.online',
      ttl: 86400,
      priority: 10
    };

    // Attach images if valid URL provided
    if (imageUrl && typeof imageUrl === 'string' && imageUrl.trim() !== '') {
      const cleanImg = imageUrl.trim();
      notificationPayload.big_picture = cleanImg;
      notificationPayload.chrome_web_image = cleanImg;
      notificationPayload.firefox_icon = cleanImg;
    }

    // Call OneSignal API
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Basic ${restApiKey}`
      },
      body: JSON.stringify(notificationPayload)
    });

    const responseData = await response.json();

    if (response.ok && responseData.id) {
      console.log("Push delivered via OneSignal ID:", responseData.id);

      // Async write log to Firebase Realtime Database
      if (admin.apps.length) {
        admin.database().ref('logs/notifications').push({
          id: responseData.id,
          title: title,
          message: message,
          recipientsCount: responseData.recipients || 0,
          domain: 'birrgo.online',
          sentAt: Date.now()
        }).catch(err => console.error("Firebase log error:", err.message));
      }

      return res.status(200).json({ 
        success: true, 
        recipients: responseData.recipients || 0,
        notificationId: responseData.id 
      });
    } else {
      console.error("OneSignal API rejected request:", responseData);
      const errDetail = responseData.errors 
        ? (Array.isArray(responseData.errors) ? responseData.errors[0] : JSON.stringify(responseData.errors)) 
        : 'OneSignal delivery rejected.';

      return res.status(400).json({
        success: false,
        error: errDetail
      });
    }

  } catch (error) {
    console.error("Serverless Function Error:", error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error processing push request.' });
  }
};
