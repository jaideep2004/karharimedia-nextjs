const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { MongoClient } = require('mongodb');
const fs = require('fs');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://jai2004bgmi:bgmi2004@singleaudio-nextjs.hamfzjb.mongodb.net/?retryWrites=true&w=majority&appName=singleaudio-nextjs';
const OUT_DIR = __dirname;

(async function main() {
  try {
    console.log('1: Connecting...');
    const mongo = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    await mongo.connect();
    console.log('2: Connected');

    const db = mongo.db('test');

    // Fetch all jobs WITH projection (only needed fields)
    console.log('3: Fetching jobs...');
    const allJobs = await db.collection('deliveryjobs').find(
      { providerKey: 'broma' },
      {
        projection: {
          _id: 1,
          state: 1,
          releaseName: 1,
          releaseId: 1,
          trackId: 1,
          errorMessage: 1,
          retryCount: 1,
          createdAt: 1,
          'metadata.bromaReleaseId': 1,
          'metadata.releaseName': 1,
          'metadata.releaseTitle': 1,
          'metadata.bsonDepthFixed': 1,
          'metadata.releaseId': 1,
          'metadata.trackId': 1,
          'metadata.title': 1,
        }
      }
    ).sort({ createdAt: -1 }).toArray();

    console.log('4: Got ' + allJobs.length + ' jobs');

    // Fetch Broma releases
    var releases = [];
    var email = process.env.BROMA_EMAIL;
    var password = process.env.BROMA_PASSWORD;
    var baseUrl = (process.env.BROMA_BASE_URL || 'https://api-rod.broma16.com/api').replace(/\/+$/, '');
    var accountId = process.env.BROMA_ACCOUNT_ID;

    if (email && accountId) {
      var axios = require('axios');
      try {
        console.log('5: Logging into Broma...');
        var lr = await axios.post(baseUrl + '/auth/login', { email: email, password: password }, { timeout: 20000 });
        var token = (lr.data?.data || lr.data).access_token || lr.data?.data?.accessToken;
        console.log('6: Login OK');

        var headers = { 'X-Access-Token': token, 'Content-Language': 'en' };
        var page = 1;

        while (page <= 20) {
          var rr = await axios.get(baseUrl + '/accounts/' + accountId + '/assets/releases', {
            headers: headers, timeout: 15000,
            params: { page: page, limit: 200 },
          });
          var items = Array.isArray(rr.data?.data) ? rr.data.data : (Array.isArray(rr.data?.items) ? rr.data.items : []);
          if (items.length === 0) break;
          releases = releases.concat(items);
          var total = rr.data?.total || 0;
          if (page === 1) console.log('7: Broma total:', total);
          page++;
          if (releases.length >= total) break;
        }
        console.log('8: Fetched ' + releases.length + ' releases');
      } catch (e) {
        console.log('8: Broma error: ' + e.message);
      }
    } else {
      console.log('5: No Broma credentials');
    }

    var bromaById = {};
    for (var i = 0; i < releases.length; i++) {
      var r = releases[i];
      if (r.id) bromaById[String(r.id)] = r;
    }

    // Classify
    console.log('9: Processing ' + allJobs.length + ' jobs...');
    var csvRows = [];
    var hopeless = [];

    for (var i = 0; i < allJobs.length; i++) {
      var j = allJobs[i];
      var relName = j.metadata?.releaseTitle || j.metadata?.releaseName || j.releaseName || j.metadata?.title || '?';
      var bid = j.metadata?.bromaReleaseId || '';
      var state = j.state;
      var err = (j.errorMessage || '').slice(0, 200);
      var bsonFixed = !!j.metadata?.bsonDepthFixed;
      var releaseId = j.releaseId || j.metadata?.releaseId || '';
      var trackId = j.trackId || j.metadata?.trackId || '';

      var bromaStatus = '-';
      if (bid) {
        var b = bromaById[bid];
        if (b) {
          var mod = b.moderation_status || '';
          var stepsList = Array.isArray(b.statuses) ? b.statuses.join(',') : b.status || '';
          bromaStatus = mod || stepsList || 'live';
        } else if (releases.length > 0) {
          bromaStatus = 'NOT_IN_BROMA';
        }
      }

      var isHopeless = false;
      var hopelessReason = '';
      if (state === 'failed') {
        if (err.indexOf('404') !== -1 || err.toLowerCase().indexOf('not found') !== -1) {
          isHopeless = true; hopelessReason = '404 -- deleted from Broma';
        } else if (err.indexOf('Missing Broma outlet') !== -1) {
          isHopeless = true; hopelessReason = 'No outlet IDs';
        } else if (err.indexOf('ENOENT') !== -1 || err.indexOf('no such file') !== -1) {
          isHopeless = true; hopelessReason = 'File missing from disk';
        } else if ((err.indexOf('timeout') !== -1 || err.indexOf('ETIMEDOUT') !== -1) && (j.retryCount || 0) > 3) {
          isHopeless = true; hopelessReason = 'Repeated timeout';
        } else if (bid && bromaStatus === 'NOT_IN_BROMA') {
          isHopeless = true; hopelessReason = 'Deleted from Broma';
        }
      }

      if (isHopeless) {
        hopeless.push({ relName: relName, bid: bid, state: state, err: err.slice(0, 120), reason: hopelessReason, releaseId: releaseId, trackId: trackId });
      }
      csvRows.push({ relName: relName, bid: bid, state: state, err: err.slice(0, 100), bsonFixed: bsonFixed, bromaStatus: bromaStatus, releaseId: releaseId, trackId: trackId, hopeless: isHopeless ? 'YES' : '' });
    }

    // Write CSV
    var csvPath = path.join(OUT_DIR, 'broma-status-all.csv');
    var header = 'releaseName,bromaReleaseId,dbState,releaseId,trackId,errorMessage,bsonFixed,bromaStatus,hopeless';
    var csvLines = [header];
    for (var i = 0; i < csvRows.length; i++) {
      var r = csvRows[i];
      csvLines.push('"' + r.relName.replace(/"/g, '""') + '","' + r.bid + '","' + r.state + '","' + r.releaseId + '","' + r.trackId + '","' + r.err.replace(/"/g, '""') + '","' + r.bsonFixed + '","' + r.bromaStatus + '","' + r.hopeless + '"');
    }
    fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf8');
    console.log('10: CSV -> ' + csvPath);

    // Write hopeless
    var hopPath = path.join(OUT_DIR, 'broma-status-hopeless.txt');
    var hopContent = 'Total hopeless: ' + hopeless.length + '\n';
    hopContent += '================================\n';
    for (var i = 0; i < hopeless.length; i++) {
      var h = hopeless[i];
      hopContent += '\n' + h.relName + '\n';
      hopContent += '  bid: ' + h.bid + ' | releaseId: ' + h.releaseId + ' | trackId: ' + h.trackId + '\n';
      hopContent += '  Reason: ' + h.reason + '\n';
      if (h.err) hopContent += '  Error: ' + h.err + '\n';
    }
    fs.writeFileSync(hopPath, hopContent, 'utf8');

    if (hopeless.length > 0) {
      console.log('11: HOPELESS (' + hopeless.length + ')');
      for (var i = 0; i < hopeless.length; i++) {
        var h = hopeless[i];
        console.log('  ' + h.relName + ' | ' + h.bid + ' | ' + h.reason);
      }
    }

    // Summary
    console.log('12: === SUMMARY ===');
    var stateCounts = {};
    for (var i = 0; i < csvRows.length; i++) {
      var s = csvRows[i].state;
      stateCounts[s] = (stateCounts[s] || 0) + 1;
    }
    for (var sk in stateCounts) console.log('  ' + sk + ': ' + stateCounts[sk]);
    console.log('  hopeless: ' + hopeless.length);

    console.log('13: Done');
    await mongo.close();
  } catch (err) {
    console.error('Fatal:', err);
    process.exit(1);
  }
})();
