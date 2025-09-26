import * as fcl from '@onflow/fcl';
import * as t from '@onflow/types';

export interface FlowWalletSignature {
  addr: string;
  keyId: number;
  signature: string;
}

export interface FlowAuthData {
  addr: string;
  cid: string;
  expiresAt: number;
  f_type: string;
  f_vsn: string;
  services: any[];
}

export class FlowWalletService {
  private flowNetwork: string;
  private accessNode: string;

  constructor(flowNetwork = 'emulator', accessNode = 'http://localhost:8080') {
    this.flowNetwork = flowNetwork;
    this.accessNode = accessNode;
    this.configureFlow();
  }

  private configureFlow(): void {
    fcl.config({
      'accessNode.api': this.accessNode,
      'discovery.wallet': this.getWalletDiscovery(),
      'app.detail.title': 'FastBreak',
      'app.detail.icon': 'https://fastbreak.app/icon.png',
    });
  }

  private getWalletDiscovery(): string {
    switch (this.flowNetwork) {
      case 'mainnet':
        return 'https://fcl-discovery.onflow.org/authn';
      case 'testnet':
        return 'https://fcl-discovery.onflow.org/testnet/authn';
      case 'emulator':
      default:
        return 'http://localhost:8701/fcl/authn';
    }
  }

  public async authenticate(): Promise<FlowAuthData> {
    try {
      const user = await fcl.authenticate();
      return user;
    } catch (error) {
      throw new Error(`Flow authentication failed: ${error}`);
    }
  }

  public async unauthenticate(): Promise<void> {
    try {
      await fcl.unauthenticate();
    } catch (error) {
      throw new Error(`Flow unauthentication failed: ${error}`);
    }
  }

  public async getCurrentUser(): Promise<FlowAuthData | null> {
    try {
      const user = await fcl.currentUser.snapshot();
      return user.loggedIn ? user : null;
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  }

  public async signMessage(message: string): Promise<FlowWalletSignature[]> {
    try {
      const MSG = Buffer.from(message).toString('hex');
      const signatures = await fcl.currentUser.signUserMessage(MSG);
      return signatures;
    } catch (error) {
      throw new Error(`Message signing failed: ${error}`);
    }
  }

  public async verifySignature(
    message: string,
    signatures: FlowWalletSignature[],
    walletAddress: string
  ): Promise<boolean> {
    try {
      const MSG = Buffer.from(message).toString('hex');
      
      // Get account information to verify signatures
      const account = await fcl.account(walletAddress);
      
      // Verify each signature
      for (const sig of signatures) {
        const key = account.keys.find((k: any) => k.index === sig.keyId);
        if (!key) {
          return false;
        }

        // Verify signature using Flow's verification
        const isValid = await fcl.verifyUserSignature(
          MSG,
          sig.signature,
          key.publicKey,
          key.signAlgo,
          key.hashAlgo
        );

        if (!isValid) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Signature verification failed:', error);
      return false;
    }
  }

  public async getAccountBalance(walletAddress: string): Promise<string> {
    try {
      const account = await fcl.account(walletAddress);
      return account.balance;
    } catch (error) {
      throw new Error(`Failed to get account balance: ${error}`);
    }
  }

  public async getAccountInfo(walletAddress: string): Promise<any> {
    try {
      const account = await fcl.account(walletAddress);
      return {
        address: account.address,
        balance: account.balance,
        code: account.code,
        keys: account.keys.map((key: any) => ({
          index: key.index,
          publicKey: key.publicKey,
          signAlgo: key.signAlgo,
          hashAlgo: key.hashAlgo,
          weight: key.weight,
          sequenceNumber: key.sequenceNumber,
          revoked: key.revoked,
        })),
        contracts: account.contracts,
      };
    } catch (error) {
      throw new Error(`Failed to get account info: ${error}`);
    }
  }

  public isValidFlowAddress(address: string): boolean {
    // Flow addresses are 16 characters long (8 bytes) and start with 0x
    const flowAddressRegex = /^0x[a-fA-F0-9]{16}$/;
    return flowAddressRegex.test(address);
  }

  public async executeScript(script: string, args: any[] = []): Promise<any> {
    try {
      const result = await fcl.query({
        cadence: script,
        args: (arg: any, t: any) => args.map(a => arg(a.value, a.type)),
      });
      return result;
    } catch (error) {
      throw new Error(`Script execution failed: ${error}`);
    }
  }

  public async sendTransaction(
    transaction: string,
    args: any[] = [],
    authorizations: string[] = []
  ): Promise<string> {
    try {
      const response = await fcl.mutate({
        cadence: transaction,
        args: (arg: any, t: any) => args.map(a => arg(a.value, a.type)),
        authorizations: authorizations.map(addr => fcl.authz),
        payer: fcl.authz,
        proposer: fcl.authz,
        limit: 1000,
      });

      return response;
    } catch (error) {
      throw new Error(`Transaction failed: ${error}`);
    }
  }
}