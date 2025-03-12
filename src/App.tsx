// src/App.tsx
import { useState, useEffect } from "react";
import { ethers } from "ethers";
import "./App.css";
import { getNativeOftAdapterContract, getOftContract } from "./contract";

// EIP-6963 제공자 정보 타입
interface EIP6963ProviderInfo {
  walletId: string;
  uuid: string;
  name: string;
  icon: string;
}

interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: any; // EIP-1193 호환 제공자
}

// // testnet (value = chainid)
// const SUPPORTED_CHAINS = [
//   {value: "0x2f", label: "XPLA"},
//   {value: "0xaa36a7", label: "ETHEREUM"},
//   {value: "0x61", label: "BNB"}
// ]

// mainnet
// const SUPPORTED_CHAINS = [
//   {value: "0x25", label: "XPLA"},
//   {value: "0x1", label: "ETHEREUM"},
//   {value: "0x38", label: "BNB"}
// ]

// testnet (value = chainid)
const SUPPORTED_CHAINS = [
  { value: "0x2f", label: "XPLA" },
  { value: "0xaa36a7", label: "ETHEREUM" },
  { value: "0x61", label: "BNB" }
]

type lzChain = {
  name: string,
  eid: string,
  chainId: string,
  nativeToken: string,
  contractAddress: string
}

const chainList = new Map<string, lzChain>()
chainList.set("0x2f", { name: "XPLA", eid: "40216", chainId: "0x2f", nativeToken: "XPLA", contractAddress: "0x2Bb21C18788587cbc3b8B903F5C8eAB9c7D26988" })
chainList.set("0xaa36a7", { name: "ETHEREUM", eid: "40161", chainId: "0xaa36a7", nativeToken: "Eth", contractAddress: "0x2Bb21C18788587cbc3b8B903F5C8eAB9c7D26988" })
chainList.set("0x61", { name: "BNB", eid: "40102", chainId: "0x61", nativeToken: "BNB", contractAddress: "0x2Bb21C18788587cbc3b8B903F5C8eAB9c7D26988" })

function App() {
  const [account, setAccount] = useState<string | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [balance, setBalance] = useState<string>("0");
  const [currentChain, setCurrentChain] = useState("");
  const [targetChain, setTargetChain] = useState("0x2f");
  const [recipient, setRecipient] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [txStatus, setTxStatus] = useState<string>("");
  const [providers, setProviders] = useState<EIP6963ProviderDetail[]>([]);
  let isSendDisable = false;

  // EIP-6963 제공자 탐지
  useEffect(() => {
    const handleAnnounceProvider = (event: CustomEvent<EIP6963ProviderDetail>) => {
      setProviders((prev) => [...prev, event.detail]);
    };

    window.addEventListener(
      "eip6963:announceProvider",
      handleAnnounceProvider as EventListener
    );

    // 제공자 요청
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    return () => {
      window.removeEventListener(
        "eip6963:announceProvider",
        handleAnnounceProvider as EventListener
      );
    };
  }, []);

  // 지갑 연결 함수
  const connectWallet = async (selectedProvider: any) => {
    try {
      const ethProvider = new ethers.BrowserProvider(selectedProvider);
      const accounts = await selectedProvider.request({
        method: "eth_requestAccounts",
      });
      const chainId = await selectedProvider.request({
        method: "eth_chainId",
      })
      setProvider(ethProvider);
      setAccount(accounts[0]);
      setCurrentChain(chainId)

      // 계정 변경 감지
      selectedProvider.on("accountsChanged", (newAccounts: string[]) => {
        setAccount(newAccounts[0] || null);
        if (!newAccounts[0]) setProvider(null);
      });
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      setTxStatus("Failed to connect wallet");
    }
  };

  // 잔액 조회 함수
  const fetchBalance = async () => {
    if (!provider || !account) return

    try {
      const currentLzChain = chainList.get(currentChain)!

      if (currentLzChain.name == "XPLA") {
        return ethers.formatEther(await provider.getBalance(account))
      }

      const contract = await getOftContract(currentLzChain.contractAddress, provider);
      const decimals = await contract.decimals();
      const balance = await contract.balanceOf(account);
      setBalance(ethers.formatUnits(balance, decimals));
    } catch (error) {
      console.error("Failed to fetch balance:", error);
    }
  };

  const sendOftTokens = async () => {
    if (!provider || !account || !recipient || !amount || !targetChain) {
      setTxStatus("Please fill in all fields and connect wallet");
      return;
    }

    if (currentChain == targetChain) {
      setTxStatus("Can't send between the same chains.");
      return;
    }

    try {
      isSendDisable = true;

      const currentLzChain = chainList.get(currentChain)!
      const targetLzChain = chainList.get(targetChain)!

      setTxStatus(`[${currentLzChain.name}] -> [${targetLzChain.name}] Processing...`);

      const amountToSend = ethers.parseEther(amount)

      const sendParam = [
        targetLzChain.eid,
        ethers.zeroPadValue(recipient, 32),
        amountToSend,
        amountToSend,
        '0x',
        '0x',
        '0x',
      ]

      if (currentLzChain.name == "XPLA") {

        const contract = await getNativeOftAdapterContract(currentLzChain.contractAddress, provider);

        const [nativeFee] = await contract.quoteSend(sendParam, false)

        const msgValue = nativeFee + amountToSend

        setTxStatus(`Estimated native fee: ${ethers.formatEther(nativeFee.toString())} ${currentLzChain.nativeToken} \nTotal (native fee + amount): ${ethers.formatEther(msgValue.toString())}`);

        const receipt = await (await contract.send(sendParam, [nativeFee, 0], recipient, { value: msgValue })).wait();
        setTxStatus(`Transaction successful! Tx Hash: ${receipt.hash}`);
      } else {
        const contract = await getOftContract(currentLzChain.contractAddress, provider);

        // Fetching the native fee for the token send operation
        const [nativeFee] = await contract.quoteSend(sendParam, false)

        setTxStatus(`Estimated native fee: ${ethers.formatEther(nativeFee.toString())}  ${currentLzChain.nativeToken}`);

        // const receipt = await (await contract.send(sendParam, [nativeFee, 0], recipient, { value: nativeFee })).wait();
        // setTxStatus(`Transaction successful! Tx Hash: ${receipt.hash}`);
      }

      fetchBalance(); // 잔액 갱신
    } catch (error: any) {
      console.error("Transaction failed:", error);
      setTxStatus(`Error: ${error.message}`);
    } finally {
      isSendDisable = false;
    }
  };


  // 계정 연결 시 잔액 조회
  useEffect(() => {
    if (account && provider) {
      fetchBalance();
    }
  }, [account, provider]);

  return (
    <div className="App">
      <h1>LayerZero send OFT DApp</h1>
      {!account ? (
        <div>
          <h2>Available Wallets</h2>
          {providers.length === 0 ? (
            <p>No wallets detected. Please install a compatible wallet.</p>
          ) : (
            providers.map((p) => (
              <button
                key={p.info.uuid}
                onClick={() => connectWallet(p.provider)}
              >
                <img src={p.info.icon} alt={p.info.name} width={20} />
                {p.info.name}
              </button>
            ))
          )}
        </div>
      ) : (
        <div>
          <p>Connected Account: {account}</p>
          <p>Balance: {balance} XPLA </p>

          <div>
            <label>{chainList.get(currentChain)!.name} ⮕ </label>
            <select
              value={targetChain}
              onChange={(e) => setTargetChain(e.target.value)}
            >
              {SUPPORTED_CHAINS.map((chain) => (
                <option key={chain.value} value={chain.value}>{chain.label}</option>
              ))}
            </select>
            <input
              size={50}
              type="text"
              placeholder="Recipient Address"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
            <input
              size={15}
              type="number"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              step="0.01"
            />
            <button disabled={isSendDisable} onClick={sendOftTokens}>Send Tokens</button>
          </div>
          <p></p>
          {txStatus && <textarea cols={80} rows={10} value={txStatus}></textarea>}
        </div>
      )}
    </div>
  );
}

export default App;