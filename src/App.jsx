import { useEffect, useState } from "react";
import { StellarWalletsKit } from "@creit-tech/stellar-wallets-kit/sdk";
import { defaultModules } from "@creit-tech/stellar-wallets-kit/modules/utils";
import * as StellarSdk from "@stellar/stellar-sdk";
import "./App.css";

const HORIZON_URL = "https://horizon-testnet.stellar.org";
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;

export default function App() {
  const [walletAddress, setWalletAddress] = useState("");
  const [balance, setBalance] = useState("--");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("1");
  const [status, setStatus] = useState("Wallet Kit is loading...");
  const [txHash, setTxHash] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    setupWalletKit();
  }, []);

  async function setupWalletKit() {
    try {
      StellarWalletsKit.init({
        modules: defaultModules(),
      });

      if (typeof StellarWalletsKit.setNetwork === "function") {
        StellarWalletsKit.setNetwork("TESTNET");
      }

      setStatus("Wallet Kit ready. Click Connect Wallet to start.");
    } catch (error) {
      console.error(error);
      setStatus("Wallet Kit initialization failed.");
    }
  }

  function shortenAddress(address) {
    if (!address) return "Not connected";
    return `${address.slice(0, 6)}...${address.slice(-6)}`;
  }

  function isValidStellarPublicKey(value) {
    try {
      return StellarSdk.StrKey.isValidEd25519PublicKey(value);
    } catch {
      return false;
    }
  }

  async function fetchBalance(address) {
    try {
      const server = new StellarSdk.Horizon.Server(HORIZON_URL);
      const account = await server.loadAccount(address);

      const nativeBalance = account.balances.find(
        (item) => item.asset_type === "native"
      );

      const formattedBalance = nativeBalance
        ? Number(nativeBalance.balance).toFixed(2)
        : "0.00";

      setBalance(formattedBalance);
      return formattedBalance;
    } catch (error) {
      console.error(error);
      setBalance("0.00");
      return "0.00";
    }
  }

  async function connectWallet() {
    try {
      setIsConnecting(true);
      setStatus("Opening Stellar Wallets Kit modal...");

      const response = await StellarWalletsKit.authModal();

      const address =
        response?.address ||
        response?.publicKey ||
        response ||
        "";

      if (!address) {
        setStatus("Wallet connected but no address was returned.");
        return;
      }

      setWalletAddress(address);
      setRecipient(address);
      setTxHash("");
      setStatus("Wallet connected successfully.");

      await fetchBalance(address);
    } catch (error) {
      console.error(error);
      setStatus("Wallet connection failed or was rejected.");
    } finally {
      setIsConnecting(false);
    }
  }

  async function disconnectWallet() {
    try {
      if (typeof StellarWalletsKit.disconnect === "function") {
        await StellarWalletsKit.disconnect();
      }
    } catch (error) {
      console.error(error);
    }

    setWalletAddress("");
    setBalance("--");
    setRecipient("");
    setTxHash("");
    setStatus("Wallet disconnected.");
  }

  async function refreshBalance() {
    if (!walletAddress) {
      setStatus("Connect wallet first.");
      return;
    }

    setStatus("Refreshing XLM balance...");
    await fetchBalance(walletAddress);
    setStatus("Balance updated.");
  }

  async function sendXlmTransaction() {
    try {
      setTxHash("");

      if (!walletAddress) {
        setStatus("Connect wallet first.");
        return;
      }

      if (!isValidStellarPublicKey(recipient)) {
        setStatus("Invalid recipient Stellar public key.");
        return;
      }

      const numericAmount = Number(amount);

      if (!numericAmount || numericAmount <= 0) {
        setStatus("Amount must be greater than 0.");
        return;
      }

      setIsSending(true);
      setStatus("Building Stellar Testnet transaction...");

      const server = new StellarSdk.Horizon.Server(HORIZON_URL);
      const sourceAccount = await server.loadAccount(walletAddress);

      const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(
          StellarSdk.Operation.payment({
            destination: recipient,
            asset: StellarSdk.Asset.native(),
            amount: numericAmount.toString(),
          })
        )
        .setTimeout(60)
        .build();

      setStatus("Waiting for wallet signature...");

      const signedResponse = await StellarWalletsKit.signTransaction(
        transaction.toXDR(),
        {
          networkPassphrase: NETWORK_PASSPHRASE,
          address: walletAddress,
        }
      );

      const signedTxXdr =
        signedResponse?.signedTxXdr ||
        signedResponse?.signedXDR ||
        signedResponse?.xdr ||
        "";

      if (!signedTxXdr) {
        setStatus("Transaction was not signed.");
        return;
      }

      setStatus("Submitting transaction to Stellar Testnet...");

      const signedTransaction = StellarSdk.TransactionBuilder.fromXDR(
        signedTxXdr,
        NETWORK_PASSPHRASE
      );

      const result = await server.submitTransaction(signedTransaction);

      setTxHash(result.hash);
      setStatus("Transaction successful.");

      await fetchBalance(walletAddress);
    } catch (error) {
      console.error(error);

      const txCode =
        error?.response?.data?.extras?.result_codes?.transaction ||
        error?.response?.data?.extras?.result_codes?.operations?.join(", ") ||
        error?.message ||
        "Unknown error";

      setStatus(`Transaction failed: ${txCode}`);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Stellar Level 1 — White Belt</p>
          <h1>Stellar Campus Grant</h1>

          <p className="hero-text">
            A simple Stellar Testnet dApp for Level 1: connect wallet, display
            XLM balance, send a testnet XLM transaction, and show the transaction
            result to the user.
          </p>

          <div className="button-row">
            {!walletAddress ? (
              <button
                className="primary-button"
                onClick={connectWallet}
                disabled={isConnecting}
              >
                {isConnecting ? "Connecting..." : "Connect Wallet"}
              </button>
            ) : (
              <button className="danger-button" onClick={disconnectWallet}>
                Disconnect Wallet
              </button>
            )}

            <button className="secondary-button" onClick={refreshBalance}>
              Refresh Balance
            </button>
          </div>
        </div>

        <div className="wallet-card">
          <p className="card-label">Wallet Status</p>
          <h2>{shortenAddress(walletAddress)}</h2>

          <div className="info-grid">
            <div>
              <span>Network</span>
              <strong>Stellar Testnet</strong>
            </div>

            <div>
              <span>XLM Balance</span>
              <strong>{balance === "--" ? "--" : `${balance} XLM`}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="main-grid">
        <div className="panel">
          <p className="card-label">Send Testnet XLM</p>
          <h2>Transaction Flow</h2>

          <label>
            Recipient address
            <input
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="Paste Stellar testnet address"
            />
          </label>

          <label>
            Amount
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="1"
            />
          </label>

          <button
            className="primary-button full-width"
            onClick={sendXlmTransaction}
            disabled={isSending || !walletAddress}
          >
            {isSending ? "Sending..." : "Send XLM on Testnet"}
          </button>
        </div>

        <div className="panel">
          <p className="card-label">Transaction Result</p>
          <h2>Status</h2>

          <div className="status-box">
            <span>Current status</span>
            <strong>{status}</strong>
          </div>

          {txHash && (
            <div className="tx-box">
              <span>Transaction hash</span>
              <code>{txHash}</code>

              <a
                href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                View on Stellar Expert
              </a>
            </div>
          )}

          <div className="checklist">
            <h3>Level 1 Checklist</h3>
            <p>✅ Wallet setup on Stellar Testnet</p>
            <p>✅ Wallet connect functionality</p>
            <p>✅ Wallet disconnect functionality</p>
            <p>✅ XLM balance display</p>
            <p>✅ Testnet XLM transaction</p>
            <p>✅ Success/failure feedback</p>
            <p>✅ Transaction hash shown to user</p>
          </div>
        </div>
      </section>
    </main>
  );
}