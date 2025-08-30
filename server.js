const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static('.'));

// Request tracking for verification
let requestCounter = 0;
const apiCallLog = [];

// Serve the HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Enhanced proxy endpoint for Prospeo API with comprehensive logging
app.post('/api/email-finder', async (req, res) => {
  const { first_name, last_name, company, api_key, request_id } = req.body;
  
  if (!api_key) {
    return res.status(400).json({ error: 'API key is required' });
  }

  if (!company) {
    return res.status(400).json({ error: 'Company field is required' });
  }

  // Increment request counter for tracking
  requestCounter++;
  const currentRequestId = request_id || `req_${requestCounter}_${Date.now()}`;
  
  // Clean and prepare company domain
  let cleanCompany = company.trim();
  // Remove common prefixes and suffixes
  cleanCompany = cleanCompany.replace(/^(www\.|https?:\/\/)/, '');
  cleanCompany = cleanCompany.replace(/\/$/, '');

  const requestPayload = {
    first_name: first_name || '',
    last_name: last_name || '',
    company: cleanCompany
  };

  const logEntry = {
    requestId: currentRequestId,
    timestamp: new Date().toISOString(),
    input: requestPayload,
    apiKey: api_key.substring(0, 8) + '...' // Log partial key for security
  };

  try {
    console.log(`[${currentRequestId}] Processing API request #${requestCounter}`);
    console.log(`[${currentRequestId}] Input data:`, requestPayload);
    console.log(`[${currentRequestId}] Making request to Prospeo API...`);
    
    const startTime = Date.now();
    
    const response = await fetch('https://api.prospeo.io/email-finder', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-KEY': api_key
      },
      body: JSON.stringify(requestPayload)
    });

    const responseTime = Date.now() - startTime;
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${currentRequestId}] HTTP error! status: ${response.status}, response: ${errorText}`);
      
      logEntry.error = `HTTP ${response.status}: ${errorText}`;
      logEntry.responseTime = responseTime;
      apiCallLog.push(logEntry);
      
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const responseText = await response.text();
    console.log(`[${currentRequestId}] API response received in ${responseTime}ms`);
    console.log(`[${currentRequestId}] Response:`, responseText);
    
    // Parse and log the response details
    try {
      const parsedResponse = JSON.parse(responseText);
      logEntry.response = parsedResponse;
      logEntry.responseTime = responseTime;
      logEntry.success = true;
      
      if (parsedResponse.response?.email) {
        console.log(`[${currentRequestId}] ✅ Email found: ${parsedResponse.response.email}`);
      } else {
        console.log(`[${currentRequestId}] ❌ No email found, status: ${parsedResponse.response?.email_status || 'UNKNOWN'}`);
      }
    } catch (parseError) {
      console.error(`[${currentRequestId}] Error parsing response:`, parseError);
      logEntry.parseError = parseError.message;
    }
    
    apiCallLog.push(logEntry);
    
    // Add request tracking to response
    const enhancedResponse = JSON.parse(responseText);
    enhancedResponse._meta = {
      requestId: currentRequestId,
      requestNumber: requestCounter,
      responseTime: responseTime,
      timestamp: new Date().toISOString()
    };
    
    res.set('Content-Type', 'application/json');
    res.send(JSON.stringify(enhancedResponse));
    
  } catch (error) {
    console.error(`[${currentRequestId}] Error processing request:`, error.message);
    
    logEntry.error = error.message;
    logEntry.success = false;
    apiCallLog.push(logEntry);
    
    res.status(500).json({ 
      error: `API request failed: ${error.message}`,
      requestId: currentRequestId
    });
  }
});

// API call verification endpoint
app.get('/api/verification-report', (req, res) => {
  const report = {
    totalApiCalls: requestCounter,
    totalLoggedCalls: apiCallLog.length,
    successfulCalls: apiCallLog.filter(log => log.success).length,
    failedCalls: apiCallLog.filter(log => !log.success).length,
    averageResponseTime: apiCallLog.length > 0 
      ? Math.round(apiCallLog.reduce((sum, log) => sum + (log.responseTime || 0), 0) / apiCallLog.length)
      : 0,
    recentCalls: apiCallLog.slice(-10), // Last 10 calls for verification
    timestamp: new Date().toISOString()
  };
  
  res.json(report);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'Server is running', 
    timestamp: new Date().toISOString(),
    totalApiCalls: requestCounter
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Enhanced Prospeo Email Finder server running on port ${PORT}`);
  console.log(`📱 Frontend available at: http://localhost:${PORT}`);
  console.log(`🔧 API endpoint: http://localhost:${PORT}/api/email-finder`);
  console.log(`📊 Verification endpoint: http://localhost:${PORT}/api/verification-report`);
});