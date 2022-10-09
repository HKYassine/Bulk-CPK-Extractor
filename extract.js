const fs = require('fs');
const util = require('util');
const path = require('path');
const cpk = require('./cpk');
const { constants } = require('buffer');
const lstat = util.promisify(fs.lstat);
const readdir = util.promisify(fs.readdir);


async function handlePathes(pathes, ext) {
    let i = 0;
    while (i < pathes.length) {
      const path1 = pathes[i];
      if (fs.existsSync(path1)) {
        const stats1 = await lstat(path1);
        if (stats1.isDirectory()) {
          pathes.splice(i, 1);
          const files = await readdir(path1);
          for (let j = 0; j < files.length; j++) {
            const base = files[j];
            const path2 = path.join(path1, base);
            const stats2 = await lstat(path2);
            if (path.parse(base).ext === ext || stats2.isDirectory()) {
              pathes.push(path2);
            }
          }
        } else if (ext && path.parse(path1).ext !== ext) {
          pathes.splice(i, 1);
        } else {
          i++;
        }
      } else {
        pathes.splice(i, 1);
      }
    }
  }

let Files  = [];

function ThroughDirectory(Directory) {
    fs.readdirSync(Directory).forEach(File => {
        const Absolute = path.join(Directory, File);
        if (fs.statSync(Absolute).isDirectory()) return ThroughDirectory(Absolute);
        else return Files.push(Absolute);
    });
}
        
let pathes = []
async function DecryptDataDL(path){
        ThroughDirectory(process.cwd() + `/${path}/`);
        let decrypt = false, key = undefined, awbKey = undefined, output = undefined, volume = 1, mode = 16, type = 1, skip = false;
        let i = 3;
        pathes = Files
        if (pathes.length === 0) {
          return console.log("Folder is empty.")
        }
        
        try {
              await handlePathes(pathes, '.cpk');
              for (let i = 0; i < pathes.length; i++) await cpk.extractCpk(pathes[i], output,i,pathes.length);
        }
           catch (e) {
          console.error(`ERROR: ${e.message}`);
          debugger;
        }
}

module.exports = {
  DecryptDataDL
}


