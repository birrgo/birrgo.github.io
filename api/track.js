const Parser = require('rss-parser');
const axios = require('axios');
const parser = new Parser();

// 1. Target News Site RSS
const NEWS_RSS_URL = 'https://news.ycombinator.com/rss';

// 2. Your Website Posting Endpoint (e.g. WordPress or custom API)
const YOUR_WEBSITE_API = 'https://yourwebsite.com/api/posts';

module.exports = async (req, res) => {
  // Handle CORS preflight requests from browsers
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Parse target news feed
    const feed = await parser.parseURL(NEWS_RSS_URL);
    
    // Grab the latest news item
    const latestNews = feed.items[0];

    const postPayload = {
      title: latestNews.title,
      summary: latestNews.contentSnippet || '',
      sourceUrl: latestNews.link,
      publishedAt: new Date()
    };

    // Forward the post to your destination website/database
    await axios.post(YOUR_WEBSITE_API, postPayload, {
      headers: {
        'Authorization': `Bearer ${process.env.MY_API_SECRET}` 
      }
    });

    return res.status(200).json({ 
      success: true, 
      message: `Posted news article: ${latestNews.title}` 
    });

  } catch (error) {
    console.error('Tracker Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
