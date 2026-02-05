const axios = require('axios');

async function inspectSwaggerUI() {
  try {
    const response = await axios.get('https://sa.ssbi.tech/api-docs/');
    const html = response.data;
    
    console.log('Content-Type:', response.headers['content-type']);
    console.log('Response length:', html.length);
    
    // Print first 2000 chars
    console.log('\n=== First 2000 characters of response ===\n');
    console.log(html.substring(0, 2000));
    
    // Look for any script tags
    console.log('\n=== Script tags ===\n');
    const scriptMatches = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
    console.log('Found', scriptMatches.length, 'script tags');
    scriptMatches.forEach((s, i) => {
      if (s.length < 500) {
        console.log(`Script ${i}:`, s.substring(0, 500));
      } else {
        console.log(`Script ${i} (truncated):`, s.substring(0, 300) + '...');
      }
    });
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

inspectSwaggerUI();
