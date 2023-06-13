// import { deployedContracts } from 'scripty.sol';
// import { Base64Converter } from "../typechain-types/contracts/extensions/OnchainArtStorageExtension.sol/Base64Converter";
import fs from "fs";
import hre, { ethers } from "hardhat";
import { getContractAddress, parseEther } from "ethers/lib/utils";

import readline from "readline";

import { stdin as input, stdout as output } from "process";
import path from "path";
import { Address } from "hardhat-deploy/dist/types";

const { getGasCost, getMintConfig } = require("../test/utils");

// import * as utilities from "scripty.sol/utils";

// import deployedContracts from "scripty.sol/utilits/deployedContracts";

// Deployed Contracts
// Ethereum Mainnet contracts:
// ScriptyStorage - 0x096451F43800f207FC32B4FF86F286EdaF736eE3
// ScriptyBuilder - 0x16b727a2Fc9322C724F4Bc562910c99a5edA5084
// ETHFSFileStorage - 0xFc7453dA7bF4d0c739C1c53da57b3636dAb0e11e
// Ethereum Goerli contracts:
// ScriptyStorage - 0x730B0ADaaD15B0551928bAE7011F2C1F2A9CA20C
// ScriptyBuilder - 0xc9AB9815d4D5461F3b53Ebd857b6582E82A45C49
// ETHFSFileStorage - 0x70a78d91A434C1073D47b2deBe31C184aA8CA9Fa

const deployedContracts = {
  mainnet: {
    ScriptyStorage: "0x096451F43800f207FC32B4FF86F286EdaF736eE3",
    ScriptyBuilder: "0x16b727a2Fc9322C724F4Bc562910c99a5edA5084",
    ETHFSFileStorage: "0xFc7453dA7bF4d0c739C1c53da57b3636dAb0e11e",
  },
  goerli: {
    ScriptyStorage: "0x730B0ADaaD15B0551928bAE7011F2C1F2A9CA20C",
    ScriptyBuilder: "0xc9AB9815d4D5461F3b53Ebd857b6582E82A45C49",
    ETHFSFileStorage: "0x70a78d91A434C1073D47b2deBe31C184aA8CA9Fa",
  },
};

const rl = readline.createInterface({ input, output });

const question = (query: string): Promise<string> =>
  new Promise((resolve, reject) => {
    try {
      rl.question(query, (answer) => {
        resolve(answer);
        rl.close();
      });
    } catch (err) {
      reject(err);
    }
  });

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const calculateCosts = async (tx: any) => {
  const receipt = await tx.wait();

  const cost = receipt.gasUsed.mul(tx.gasPrice ?? 0);

  // print table of: gas used, gas limit, gas price in gwei, cost in eth, projected cost at 30 gwei, cost in usd at eth = 1800
  console.log(`\t====================\t`);
  console.log(`\tGas used:\t${receipt.gasUsed.toString()}`);
  console.log(`\tGas limit:\t${tx.gasLimit.toString()}`);

  const gasPrice = tx.gasPrice!;

  console.log(`\tGas price:\t${gasPrice.div(1e9).toString()} gwei`);

  const costInEth = ethers.utils.formatEther(cost);

  console.log(`\tCost in ETH:\t${costInEth} ETH`);

  const costInUsd = ethers.utils.formatEther(
    cost.mul(ethers.utils.parseEther("1800")).div("" + 1e18)
  );

  console.log(`\tCost in USD:\t${costInUsd} USD`);

  // calculate cost as if gas price is 30 gwei

  const costAt30Gwei = ethers.utils.formatEther(cost.mul(30e9).div(gasPrice));

  console.log(`\tCost at 30 gwei:\t${costAt30Gwei} ETH`);

  const costAt30GweiInUsd = ethers.utils.formatEther(
    cost
      .mul(30e9)
      .div(gasPrice)
      .mul(ethers.utils.parseEther("1800"))
      .div("" + 1e18)
  );

  console.log(`\tCost at 30 gwei:\t${costAt30GweiInUsd} USD`);

  console.log(`\t====================\t`);
};

const main = async () => {
  const [admin] = await hre.ethers.getSigners();

  // rm ./scripts/onchain/output.html if exists
  if (fs.existsSync("./scripts/onchain/output.html")) {
    fs.unlinkSync("./scripts/onchain/output.html");
  }

  // get values from console input: nft contract address, artwork string
  let nft = await question("Enter NFT contract address: ");
  // const artwork = await question("Enter artwork string: ");

  // print values
  // console.log("Artwork string is", artwork);

  // check that nft is a valid address and has contract code
  // const code = await hre.ethers.provider.getCode(nft);
  if (!nft || (await hre.ethers.provider.getCode(nft)) === "0x") {
    if (hre.network.name === "goerli" || hre.network.name === "mainnet") {
      throw new Error("NFT contract address is not valid");
    }

    console.log("NFT contract address is not valid, deploying new one...");

    const f = await hre.ethers.getContractFactory("ERC721CommunityBase");

    const erc721 = await f.deploy(
      "Test",
      "NFT",
      1000,
      3,
      false,
      "ipfs://factory-test/",
      {
        ...getMintConfig(),
        publicPrice: parseEther("0.1"),
        maxTokensPerMint: 20,
      }
    );

    await erc721.deployed();

    nft = erc721.address;
  }

  console.log("NFT contract address is", nft);
  //   const lib = await hre.ethers.getContractFactory("Base64Converter");
  //   const libDeployed = await lib.deploy();
  //   await libDeployed.deployed();
  //   console.log("Base64Converter deployed to:", libDeployed.address);

  // deploy ArtgeneScript
  const ArtgeneScript = await hre.ethers.getContractFactory("Artgene_js");
  const artgeneScript = await ArtgeneScript.deploy();
  await artgeneScript.deployed();
  console.log("ArtgeneScript deployed to:", artgeneScript.address);

  await calculateCosts(artgeneScript.deployTransaction);

  if (hre.network.name === "goerli" || hre.network.name === "mainnet") {
    // dont wait for verification
    hre.run("verify:verify", {
      address: artgeneScript.address,
      constructorArguments: [],
    });
  }

  // deploy OnchainArtStorageExtension.sol
  const OnchainArtStorageExtension = await hre.ethers.getContractFactory(
    "InformationAge_js"
  );

  const deps: [Address, Address, Address] =
    hre.network.name === "goerli" || process.env.FORK === "goerli"
      ? [
          deployedContracts.goerli.ETHFSFileStorage,
          deployedContracts.goerli.ScriptyStorage,
          deployedContracts.goerli.ScriptyBuilder,
        ]
      : [
          deployedContracts.mainnet.ETHFSFileStorage,
          deployedContracts.mainnet.ScriptyStorage,
          deployedContracts.mainnet.ScriptyBuilder,
        ];

  const onchainArtStorageExtension = await OnchainArtStorageExtension.deploy(
    nft,
    artgeneScript.address,
    ...deps
  );

  await onchainArtStorageExtension.deployed();

  console.log(
    "OnchainArtStorageExtension deployed to:",
    onchainArtStorageExtension.address
  );

  // deploy cost analysis
  await calculateCosts(onchainArtStorageExtension.deployTransaction);

  // verify contract
  if (hre.network.name === "goerli" || hre.network.name === "mainnet") {
    await hre.run("verify:verify", {
      address: onchainArtStorageExtension.address,
      constructorArguments: [
        nft,
        artgeneScript.address,
        deployedContracts.goerli.ETHFSFileStorage,
        deployedContracts.goerli.ScriptyStorage,
        deployedContracts.goerli.ScriptyBuilder,
      ],
    });
  }

  const tokenHTML = await onchainArtStorageExtension.tokenHTML(
    1,
    ethers.constants.HashZero,
    []
  );

  fs.writeFileSync(path.join(__dirname, "onchain", "output.html"), tokenHTML);
  // record gas usage calling tokenHTML and render() functions
  const tokenHTMLGas = await onchainArtStorageExtension.estimateGas.tokenHTML(
    1,
    ethers.constants.HashZero,
    []
  );

  const renderGas = await onchainArtStorageExtension.estimateGas.render(
    1,
    ethers.constants.HashZero
  );

  console.log(`\t====================\t`);
  console.log(`\tToken HTML gas:\t\t${tokenHTMLGas}`);
  console.log(`\tRender gas:\t\t${renderGas}`);
  console.log(`\t====================\t`);
};

// call main only if executed directly
if (process.argv[1] === __filename) {
  // if --help or -h flag is passed, show help
  // if (process.argv[2] === "--help" || process.argv[2] === "-h" || process.argv.length < 4) {
  //     console.log(
  //         "Usage: npx hardhat run scripts/deploy-onchain-art-storage-extension.ts <nft> <artwork>"
  //     );
  //     process.exit(0);
  // }

  // We recommend this pattern to be able to use async/await everywhere
  // and properly handle errors.
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
