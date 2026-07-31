require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/karharimedia').then(async () => {
  const provider = await mongoose.connection.collection('dspproviders').findOne({ key: 'youtube' });
  if (!provider) {
    console.log('No YouTube provider found');
    process.exit(0);
  }
  console.log('=== YouTube Provider ===');
  console.log('key:', provider.key);
  console.log('integrationMode:', provider.integrationMode);
  console.log('enabled:', provider.enabled);
  console.log('has credentials:', !!provider.credentials);
  console.log('credentials type:', typeof provider.credentials);
  console.log('credentials keys:', Object.keys(provider.credentials || {}));
  console.log('credentials:', JSON.stringify(provider.credentials, null, 2).slice(0, 2000));
  console.log('has config:', !!provider.config);
  console.log('config:', JSON.stringify(provider.config, null, 2));
  await mongoose.disconnect();
}).catch(e => { console.error(e); process.exit(1); });
