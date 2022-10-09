let extract = require("./extract.js")
const inquirer = require("inquirer")

async function main(){
    let prompt =  await inquirer.prompt([{
        type:"input",
        message: "Where are located the CPKs you want to extract ?",
        name: "path"
    }])
    await extract.DecryptDataDL(prompt.path) 
    console.log("Done !")
}
main()
