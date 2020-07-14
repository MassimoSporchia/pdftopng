const fs = require('fs');
const ss = require('stringstream');
const AWS = require('aws-sdk');
const exec = require('await-exec');
const s3 = new AWS.S3();
const os = require('os');
const path = require('path');

var utils = {
  decodeKey: function (key) {
    return decodeURIComponent(key).replace(/\+/g, " ");
  },
};

exports.handler = async (event,callback) => {
  process.env['PATH'] = process.env['PATH'] + ':' + process.env['LAMBDA_TASK_ROOT']

  var bucket = event.Records[0].s3.bucket.name,
    srcKey = utils.decodeKey(event.Records[0].s3.object.key),
    dstPrefix = srcKey.replace(/\.\w+$/, "") + "/",
    fileType = srcKey.slice(-3, srcKey.length);

  if (!fileType || fileType != "pdf") {
    var msg = "Invalid filetype found for key: " + srcKey;
    callback(msg);
    return;
  }

  console.log("starting the convertion process...");
  var base64file = await getFileBase64(bucket, srcKey);
  base64file = base64file.replace("undefined", "");
  await operate(base64file, srcKey);
  return sendRes(200, 'Successfully executed');
};

const sendRes = (status, body) => {
  var response = {
    statusCode: status,
    headers: {
      "Content-Type": "text/html"
    },
    body: body
  };
  return response;
}

async function getFileBase64(bucket, object)
{
    let params = {
        Bucket: bucket,
        Key: object
      };

    var file;
    var base64Str;

    file = s3.getObject(params).createReadStream()
        .pipe(ss('base64'));  

    file.on('data', data => base64Str += data);
      return new Promise(function(resolve) {
        file.on('end', () => resolve(base64Str));
    });
}

const operate = async (body, fileName) => {
    let outputExtension = 'png';
    let inputFile = null, outputFile = null;
    inputFile = '/tmp/inputFile.pdf';
    const buffer = new Buffer(body, 'base64');
    fs.writeFileSync(inputFile, buffer);
    try {
      

      await ghostScriptPDF(fileName);
       fs.unlinkSync(inputFile)

      console.log("done with ghostscript");

      // GET ALL IMAGES IN BUCKET
      return new Promise((resolve, reject) => 
      { 
          fs.readdir('/tmp/', async (err, files) => {
            for(const file of files)
            {
              console.log("OUTPUT FILE: " + file);
              if(path.extname(file) != "pdf")
              {
                let fileBuffer = new Buffer(fs.readFileSync('/tmp/' + file));
                fs.unlinkSync('/tmp/' + file);

                await putfile(fileBuffer, file);
              }
            }
          err ? reject(err) : resolve(files);
        });
      });

      // customArgs.push(outputFile);
      // await performConvert(customArgs);
    } catch (e) {
      console.log(`Error:${e}`);
      return sendRes(500, e);
    }
}

const ghostScriptPDF = async (fileName) => {
  return await exec('gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=pngalpha -r600 -dDownScaleFactor=3 -sOutputFile=/tmp/'+fileName+'-%03d.png /tmp/inputFile.pdf');
}

const putfile = async (buffer, fileName) => {
  let params = {
    Bucket: process.env.DST_BUCKET,
    Key: fileName,
    Body: buffer
  };
  return await s3.putObject(params).promise();
}