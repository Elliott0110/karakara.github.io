require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const {google} = require('googleapis');

const PORT = process.env.PORT || 3000;
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID;
if(!DRIVE_FOLDER_ID) console.warn('Warning: DRIVE_FOLDER_ID not set. Set it in .env to list images from your folder.');

// Create auth from service account JSON (either raw JSON in env or file path)
function getServiceAccountCredentials(){
  if(process.env.SERVICE_ACCOUNT_JSON){
    try{
      return JSON.parse(process.env.SERVICE_ACCOUNT_JSON);
    }catch(e){
      console.error('Failed to parse SERVICE_ACCOUNT_JSON');
      throw e;
    }
  }
  if(process.env.GOOGLE_APPLICATION_CREDENTIALS){
    const p = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    return require(path.resolve(p));
  }
  throw new Error('No service account credentials found. Set SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS');
}

const key = (()=>{try{return getServiceAccountCredentials();}catch(e){return null}})();
if(!key) console.warn('Service account credentials not configured; server will fail when calling Drive API.');

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly','https://www.googleapis.com/auth/drive.file'];
let driveClient;
if(key){
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: SCOPES,
  });
  driveClient = google.drive({version:'v3', auth});
}

const app = express();
app.use(cors());
app.use(express.json());

// Simple health
app.get('/api/health', (req,res)=>res.json({ok:true,driveConfigured:!!driveClient}));

// List image files in DRIVE_FOLDER_ID and return array of {id,name,url,mimeType}
app.get('/api/images', async (req,res)=>{
  if(!driveClient){
    return res.status(500).json({error:'Drive client not configured on server.'});
  }
  const folderId = req.query.folderId || DRIVE_FOLDER_ID;
  if(!folderId) return res.status(400).json({error:'folderId is required (or set DRIVE_FOLDER_ID in .env)'});

  try{
    const q = `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`;
    const r = await driveClient.files.list({
      q,
      fields: 'files(id,name,mimeType,thumbnailLink,webViewLink,iconLink) ',
      pageSize: 200,
    });
    const files = (r.data.files || []).map(f=>({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      url: `/api/image/${f.id}`,
      thumb: f.thumbnailLink || `/api/image/${f.id}`
    }));
    res.json(files);
  }catch(err){
    console.error('Drive list error',err);
    res.status(500).json({error:'failed to list files',details:err.message});
  }
});

// Proxy an image by fileId. Browser will request /api/image/:id
app.get('/api/image/:id', async (req,res)=>{
  if(!driveClient) return res.status(500).send('Drive client not configured');
  const fileId = req.params.id;
  try{
    // get metadata to set content-type
    const meta = await driveClient.files.get({fileId, fields:'mimeType,name'});
    const mime = meta.data.mimeType || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    // stream file
    const streamRes = await driveClient.files.get({fileId, alt:'media'}, {responseType:'stream'});
    streamRes.data.pipe(res).on('error',(e)=>{
      console.error('Stream error',e);
      res.end();
    });
  }catch(err){
    console.error('Error proxying file',err);
    res.status(500).json({error:'failed to fetch file',details:err.message});
  }
});

// Optional upload endpoint (requires ENABLE_UPLOAD=true and drive.file scope)
if(process.env.ENABLE_UPLOAD === 'true' || process.env.ENABLE_UPLOAD === '1'){
  const upload = multer({dest: path.join(__dirname,'tmp')});
  app.post('/api/upload', upload.single('image'), async (req,res)=>{
    if(!driveClient) return res.status(500).json({error:'Drive client not configured'});
    if(!req.file) return res.status(400).json({error:'image file required (multipart/form-data field `image`)'});
    const folderId = req.body.folderId || DRIVE_FOLDER_ID;
    if(!folderId) return res.status(400).json({error:'folderId required (or set DRIVE_FOLDER_ID)'});
    try{
      const filepath = req.file.path;
      const name = req.file.originalname || req.file.filename;
      const media = {mimeType: req.file.mimetype, body: fs.createReadStream(filepath)};
      const fileMetadata = {name, parents:[folderId]};
      const r = await driveClient.files.create({resource: fileMetadata, media, fields:'id,name'});
      // cleanup
      fs.unlink(filepath, ()=>{});
      res.json({ok:true,file:r.data});
    }catch(err){
      console.error('Upload error',err);
      res.status(500).json({error:'upload failed',details:err.message});
    }
  });
}

app.listen(PORT, ()=>console.log(`Gallery server listening on http://localhost:${PORT} (proxying Drive)`));
