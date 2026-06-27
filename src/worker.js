// This backend connects to an external R2/S3 bucket for storage
// and directly to the Google Gemini API for AI generation.

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // --- Handle CORS preflight requests ---
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Destination-Url",
        },
      });
    }

    const corsHeaders = { "Access-Control-Allow-Origin": "*", 'Content-Type': 'application/json' };
    
    // Define the Gemini API endpoint (using 1.5 Flash for speed, swap to pro if needed)
    const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;

    // --- 1. CHAT ROUTE ---
    if (url.pathname === '/api/chat') {
      try {
        const { action, userId, message } = await request.json();
        const s3 = new S3Client(env);

        if (action === 'load') {
          const history = await s3.getObject(userId);
          return new Response(JSON.stringify({ history: history || [] }), { headers: corsHeaders });
        }

        if (action === 'send') {
          // 1. Load history and add the new user message
          let history = await s3.getObject(userId) || [];
          history.push({ role: 'user', content: message });
          
          // 2. Format the last 6 messages for Gemini's strict structure
          const latestHistory = history.slice(-6);
          const geminiContents = latestHistory.map(msg => ({
            // Gemini uses 'model' instead of 'assistant'
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
          }));

          // 3. Send to Gemini API
          const geminiResponse = await fetch(geminiEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  system_instruction: { 
                    parts: [{ text: "You are an AI Frenz, a friendly and supportive AI companion. Your goal is to build a personal connection with the user. Keep your responses conversational and friendly." }] 
                  },
                  contents: geminiContents
              })
          });

          if (!geminiResponse.ok) throw new Error("Failed to get response from Gemini.");
          
          const geminiData = await geminiResponse.json();
          const aiReply = geminiData.candidates[0].content.parts[0].text;

          // 4. Save to S3 using your original formatting
          history.push({ role: 'assistant', content: aiReply });
          await s3.putObject(userId, history);

          return new Response(JSON.stringify({ reply: aiReply }), { headers: corsHeaders });
        }
        return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: corsHeaders });

      } catch (e) {
          console.error("Error in /api/chat handler:", e);
          return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
      }
    }
    
    // --- 2. GAME ENGINE PROXY (JSON NATIVE) ---
    if (url.pathname === '/api/proxy') {
      try {
        // Read the destination URL from the X-Destination-Url header
        const destinationUrl = request.headers.get('X-Destination-Url');
        
        if (!destinationUrl) {
          throw new Error("Missing X-Destination-Url header");
        }

        const requestBody = await request.json();

        // If it's a Gemini endpoint, use the requested URL but inject the API key securely
        if (destinationUrl.includes('generativelanguage.googleapis.com')) {
          const targetUrl = new URL(destinationUrl);
          
          // Inject the secret key into the query parameters
          targetUrl.searchParams.set('key', env.GEMINI_API_KEY);
          
          const proxyResponse = await fetch(targetUrl.toString(), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(requestBody)
          });

          if (!proxyResponse.ok) {
              const errorText = await proxyResponse.text();
              throw new Error(`Gemini API returned ${proxyResponse.status}: ${errorText}`);
          }

          const responseData = await proxyResponse.json();
          return new Response(JSON.stringify(responseData), { headers: corsHeaders });
        }

        // For other APIs, forward without modification
        const proxyResponse = await fetch(destinationUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!proxyResponse.ok) {
            const errorText = await proxyResponse.text();
            throw new Error(`Destination API returned ${proxyResponse.status}: ${errorText}`);
        }

        const responseData = await proxyResponse.json();
        return new Response(JSON.stringify(responseData), { headers: corsHeaders });

      } catch(e) {
          console.error("Error in /api/proxy handler:", e);
          return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
      }
    }

    // --- Static Asset Server ---
    return env.ASSETS.fetch(request);
  },
};

// --- Lightweight S3 Client for R2 (Unchanged) ---
class S3Client {
    constructor(env) {
        this.endpoint = env.S3_ENDPOINT;
        this.accessKeyId = env.S3_ACCESS_KEY_ID;
        this.secretAccessKey = env.S3_SECRET_ACCESS_KEY;
        this.bucket = env.S3_BUCKET_NAME;
        this.region = 'auto';
    }

    async getObject(key) {
        const url = new URL(`${this.endpoint}/${this.bucket}/${key}`);
        const response = await this.signedFetch(url, { method: 'GET' });
        if (response.status === 404) return null;
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`S3 GET failed: ${response.status} ${errorText}`);
        }
        return response.json();
    }

    async putObject(key, data) {
        const url = new URL(`${this.endpoint}/${this.bucket}/${key}`);
        const body = JSON.stringify(data);
        const response = await this.signedFetch(url, {
            method: 'PUT',
            body: body,
            headers: { 'Content-Type': 'application/json' }
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`S3 PUT failed: ${response.status} ${errorText}`);
        }
    }
    
    async signedFetch(url, options = {}) {
        const signedRequest = await this.signRequest(url, options);
        return fetch(signedRequest);
    }
    
    async signRequest(url, options) {
        const date = new Date();
        const ymd = date.toISOString().substring(0, 10).replace(/-/g, '');
        const amzDate = date.toISOString().replace(/[:\-]|\.\d{3}/g, '');

        options.headers = options.headers || {};
        options.headers['host'] = url.hostname;
        options.headers['x-amz-date'] = amzDate;
        
        const body = options.body || '';
        const bodyHash = await this.hash(body);
        options.headers['x-amz-content-sha256'] = bodyHash;
        
        const canonicalHeaders = Object.keys(options.headers).sort().map(k => `${k.toLowerCase()}:${options.headers[k]}\n`).join('');
        const signedHeaders = Object.keys(options.headers).sort().map(k => k.toLowerCase()).join(';');
        
        const canonicalRequest = [
            options.method, url.pathname, url.search.substring(1),
            canonicalHeaders, signedHeaders, bodyHash
        ].join('\n');
        
        const credentialScope = `${ymd}/${this.region}/s3/aws4_request`;
        const stringToSign = [
            'AWS4-HMAC-SHA256', amzDate, credentialScope, await this.hash(canonicalRequest)
        ].join('\n');
        
        const signingKey = await this.hmac(await this.hmac(await this.hmac(await this.hmac(`AWS4${this.secretAccessKey}`, ymd), this.region), 's3'), 'aws4_request');
        const signature = await this.hmac(signingKey, stringToSign);

        options.headers['Authorization'] = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${this.toHex(signature)}`;
        
        return new Request(url, options);
    }
    
    async hash(data) {
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
        return this.toHex(hash);
    }
    
    async hmac(key, data) {
        const importedKey = await crypto.subtle.importKey('raw', typeof key === 'string' ? new TextEncoder().encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const mac = await crypto.subtle.sign('HMAC', importedKey, new TextEncoder().encode(data));
        return mac;
    }

    toHex(buffer) {
        return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
}