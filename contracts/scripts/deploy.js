const fcl = require('@onflow/fcl');
const fs = require('fs');
const path = require('path');

// Configuration
const NETWORK = process.env.FLOW_NETWORK || 'emulator';
const PRIVATE_KEY = process.env.FLOW_PRIVATE_KEY;
const ACCOUNT_ADDRESS = process.env.FLOW_ACCOUNT_ADDRESS;

// Configure FCL
fcl.config({
  'accessNode.api': getAccessNodeAPI(NETWORK),
  'discovery.wallet': getWalletDiscovery(NETWORK),
  'app.detail.title': 'FastBreak Contract Deployment',
  'app.detail.icon': 'https://fastbreak.com/icon.png'
});

function getAccessNodeAPI(network) {
  switch (network) {
    case 'emulator':
      return 'http://127.0.0.1:8888';
    case 'testnet':
      return 'https://rest-testnet.onflow.org';
    case 'mainnet':
      return 'https://rest-mainnet.onflow.org';
    default:
      throw new Error(`Unknown network: ${network}`);
  }
}

function getWalletDiscovery(network) {
  switch (network) {
    case 'emulator':
      return 'http://127.0.0.1:8701/fcl/authn';
    case 'testnet':
      return 'https://fcl-discovery.onflow.org/testnet/authn';
    case 'mainnet':
      return 'https://fcl-discovery.onflow.org/authn';
    default:
      throw new Error(`Unknown network: ${network}`);
  }
}

// Load contract source code
function loadContract(contractName) {
  const contractPath = path.join(__dirname, '..', 'cadence', `${contractName}.cdc`);
  return fs.readFileSync(contractPath, 'utf8');
}

// Deploy contract
async function deployContract(contractName, contractCode) {
  console.log(`Deploying ${contractName} to ${NETWORK}...`);

  const deployTransaction = `
    transaction(name: String, code: String) {
      prepare(signer: AuthAccount) {
        signer.contracts.add(name: name, code: code.utf8)
      }
    }
  `;

  try {
    const transactionId = await fcl.mutate({
      cadence: deployTransaction,
      args: (arg, t) => [
        arg(contractName, t.String),
        arg(contractCode, t.String)
      ],
      proposer: fcl.authz,
      payer: fcl.authz,
      authorizations: [fcl.authz],
      limit: 9999
    });

    console.log(`Transaction ID: ${transactionId}`);
    
    const result = await fcl.tx(transactionId).onceSealed();
    console.log(`${contractName} deployed successfully!`);
    
    return result;
  } catch (error) {
    console.error(`Failed to deploy ${contractName}:`, error);
    throw error;
  }
}

// Update contract
async function updateContract(contractName, contractCode) {
  console.log(`Updating ${contractName} on ${NETWORK}...`);

  const updateTransaction = `
    transaction(name: String, code: String) {
      prepare(signer: AuthAccount) {
        signer.contracts.update__experimental(name: name, code: code.utf8)
      }
    }
  `;

  try {
    const transactionId = await fcl.mutate({
      cadence: updateTransaction,
      args: (arg, t) => [
        arg(contractName, t.String),
        arg(contractCode, t.String)
      ],
      proposer: fcl.authz,
      payer: fcl.authz,
      authorizations: [fcl.authz],
      limit: 9999
    });

    console.log(`Transaction ID: ${transactionId}`);
    
    const result = await fcl.tx(transactionId).onceSealed();
    console.log(`${contractName} updated successfully!`);
    
    return result;
  } catch (error) {
    console.error(`Failed to update ${contractName}:`, error);
    throw error;
  }
}

// Check if contract exists
async function contractExists(contractName) {
  const checkScript = `
    import ${contractName} from 0x${ACCOUNT_ADDRESS}
    
    pub fun main(): Bool {
      return true
    }
  `;

  try {
    await fcl.query({
      cadence: checkScript
    });
    return true;
  } catch (error) {
    return false;
  }
}

// Main deployment function
async function main() {
  console.log('FastBreak Smart Contract Deployment');
  console.log('===================================');
  console.log(`Network: ${NETWORK}`);
  console.log(`Account: ${ACCOUNT_ADDRESS}`);
  console.log('');

  // Authenticate if not using emulator
  if (NETWORK !== 'emulator') {
    console.log('Please authenticate with your Flow wallet...');
    const currentUser = await fcl.currentUser.snapshot();
    if (!currentUser.loggedIn) {
      await fcl.authenticate();
    }
  }

  const contracts = [
    'FastBreakController',
    'SafetyControls', 
    'TradeAnalytics'
  ];

  for (const contractName of contracts) {
    try {
      const contractCode = loadContract(contractName);
      const exists = await contractExists(contractName);

      if (exists) {
        console.log(`${contractName} already exists. Updating...`);
        await updateContract(contractName, contractCode);
      } else {
        console.log(`Deploying ${contractName}...`);
        await deployContract(contractName, contractCode);
      }

      console.log(`✅ ${contractName} deployment completed\n`);
    } catch (error) {
      console.error(`❌ Failed to deploy ${contractName}:`, error.message);
      process.exit(1);
    }
  }

  console.log('🎉 All contracts deployed successfully!');
  console.log('');
  console.log('Next steps:');
  console.log('1. Run integration tests');
  console.log('2. Verify contract functionality');
  console.log('3. Update frontend configuration');
  console.log('4. Monitor contract events');
}

// Run deployment
if (require.main === module) {
  main().catch(error => {
    console.error('Deployment failed:', error);
    process.exit(1);
  });
}

module.exports = {
  deployContract,
  updateContract,
  contractExists,
  loadContract
};