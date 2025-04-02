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

type LzChain = {
  name: string,
  eid: string,
  chainId: string,
  nativeToken: string,
  contractAddress: string
}

// mainnet
const SUPPORTED_CHAINS = [
  {value: "0x25", label: "XPLA"},
  {value: "0x1", label: "ETHEREUM"},
  {value: "0x38", label: "BNB"}
]
const chainList = new Map<string, LzChain>()
chainList.set("0x25", { name: "XPLA", eid: "30216", chainId: "0x25", nativeToken: "XPLA", contractAddress: "0x332DD4F170cdfC27756EE4159E7DBF034c84C65b" })
chainList.set("0x1", { name: "ETHEREUM", eid: "30101", chainId: "0x1", nativeToken: "Eth", contractAddress: "0x332DD4F170cdfC27756EE4159E7DBF034c84C65b" })
chainList.set("0x38", { name: "BNB", eid: "30102", chainId: "0x38", nativeToken: "BNB", contractAddress: "0x332DD4F170cdfC27756EE4159E7DBF034c84C65b" })


// // testnet (value = chainid)
// const SUPPORTED_CHAINS = [
//   { value: "0x2f", label: "XPLA" },
//   { value: "0xaa36a7", label: "ETHEREUM" },
//   { value: "0x61", label: "BNB" }
// ]

// const chainList = new Map<string, LzChain>()
// chainList.set("0x2f", { name: "XPLA", eid: "40216", chainId: "0x2f", nativeToken: "XPLA", contractAddress: "0x2fa515603bC943c576DE404A044E1E4d3194bbB4" })
// chainList.set("0xaa36a7", { name: "ETHEREUM", eid: "40161", chainId: "0xaa36a7", nativeToken: "Eth", contractAddress: "0x2fa515603bC943c576DE404A044E1E4d3194bbB4" })
// chainList.set("0x61", { name: "BNB", eid: "40102", chainId: "0x61", nativeToken: "BNB", contractAddress: "0x2fa515603bC943c576DE404A044E1E4d3194bbB4" })

type EstimatedInfo = {
  from: LzChain,
  to: LzChain,
  amount: bigint,
  nativeFee: bigint
}

function App() {
  const [account, setAccount] = useState<string | null>(null);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [balance, setBalance] = useState<string>("0");
  const [currentChain, setCurrentChain] = useState("");
  const [targetChain, setTargetChain] = useState("0x2f");
  const [recipient, setRecipient] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [txStatus, setTxStatus] = useState<string>("");
  const [txHash, setTxHash] = useState<string>("");
  const [providers, setProviders] = useState<EIP6963ProviderDetail[]>([]);
  const [estimatedInfo, setEstimatedInfo] = useState<EstimatedInfo>();


  // EIP-6963 제공자 탐지
  useEffect(() => {
    const handleAnnounceProvider = (event: CustomEvent<EIP6963ProviderDetail>) => {
      setProviders((prev) => {
        // 이미 존재하는 UUID인지 확인
        const isDuplicate = prev.some(
          (provider) => provider.info.uuid === event.detail.info.uuid
        );
        if (isDuplicate) {
          return prev; // 중복이면 추가하지 않음
        }
        return [...prev, event.detail];
      });
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
        setTxStatus("accounts changed");
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
        setBalance(ethers.formatEther(await provider.getBalance(account)))
        return
      }

      const contract = await getOftContract(currentLzChain.contractAddress, provider)
      const decimals = await contract.decimals()
      const balance = await contract.balanceOf(account)
      setBalance(ethers.formatUnits(balance, decimals))
    } catch (error) {
      console.error("Failed to fetch balance:", error)
    }
  };

  // native fee 측정
  const estimateSendOftTokens = async () => {
    if (!provider || !account || !recipient || !amount || !targetChain) {
      setTxStatus("Please fill in all fields and connect wallet")
      return;
    }

    if (currentChain == targetChain) {
      setTxStatus("Can't send between the same chains.")
      return;
    }

    try {

      setTxHash("")

      const currentLzChain = chainList.get(currentChain)!
      const targetLzChain = chainList.get(targetChain)!

      setTxStatus(`[${currentLzChain.name}] -> [${targetLzChain.name}] Processing...`)

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

        const contract = await getNativeOftAdapterContract(currentLzChain.contractAddress, provider)

        const [estimatedNativeFee] = await contract.quoteSend(sendParam, false)

        const msgValue = estimatedNativeFee + amountToSend


        setTxStatus(`Estimated native fee: ${ethers.formatEther(estimatedNativeFee.toString())} ${currentLzChain.nativeToken} 
        Total (native fee + amount): ${ethers.formatEther(msgValue.toString())} ${currentLzChain.nativeToken}`)

        // Xpla에서 estimate 안되는 문제 있음.
        // const estimatedGas = await contract.send.estimateGas(sendParam, [estimatedNativeFee, 0], recipient, { from: account, value: estimatedNativeFee })

        // setTxStatus(`Estimated native fee: ${ethers.formatEther(estimatedNativeFee.toString())} ${currentLzChain.nativeToken} 
        // Total (native fee + amount): ${ethers.formatEther(msgValue.toString())} ${currentLzChain.nativeToken}
        // Estimated Gas: ${estimatedGas}`)

        // estimated 항목에 정보 추가
        setEstimatedInfo({ from: currentLzChain, to: targetLzChain, amount: amountToSend, nativeFee: estimatedNativeFee })
      } else {
        const contract = await getOftContract(currentLzChain.contractAddress, provider)

        // Fetching the native fee for the token send operation
        const [estimatedNativeFee] = await contract.quoteSend(sendParam, false)

        const estimatedGas = await contract.send.estimateGas(sendParam, [estimatedNativeFee, 0], recipient, { value: estimatedNativeFee })

        setTxStatus(`Estimated native fee: ${ethers.formatEther(estimatedNativeFee.toString())} ${currentLzChain.nativeToken}
        Estimated Gas: ${estimatedGas}`)

        // estimated 항목에 정보 추가
        setEstimatedInfo({ from: currentLzChain, to: targetLzChain, amount: amountToSend, nativeFee: estimatedNativeFee })
      }
    } catch (error: any) {
      console.error("Transaction failed:", error)
      setTxStatus(`Error: ${error.message}`)
    }
  }

  // Oft 전송
  const sendOftTokens = async () => {
    if (!provider || !account || !recipient || !amount || !targetChain) {
      setTxStatus("Please fill in all fields and connect wallet");
      return;
    }

    if (!estimatedInfo) {
      setTxStatus("Please estimate fee before sending oft");
      return;
    }

    if (currentChain == targetChain) {
      setTxStatus("Can't send between the same chains.");
      return;
    }

    try {
      const currentLzChain = chainList.get(currentChain)!
      const targetLzChain = chainList.get(targetChain)!

      const amountToSend = ethers.parseEther(amount)

      // from, to, amount가 입력창의 값과 같은지 확인
      if (estimatedInfo.amount != amountToSend || estimatedInfo.from.chainId != currentLzChain.chainId || estimatedInfo.to != targetLzChain) {
        setTxStatus("\nA change has been detected. Please estimate again. (Previous estimate values ​​have been reset.)")
        setEstimatedInfo(undefined)
        return
      }

      setTxStatus(`[${currentLzChain.name}] -> [${targetLzChain.name}] Processing...`)

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
        const contract = await getNativeOftAdapterContract(currentLzChain.contractAddress, provider)
        const msgValue = estimatedInfo.nativeFee + estimatedInfo.amount

        setTxStatus(`[${currentLzChain.name}] => [${targetLzChain.name}] Sending XPLA OFT... `)

        const receipt = await (await contract.send(sendParam, [estimatedInfo.nativeFee, 0], recipient, { value: msgValue })).wait()

        setTxStatus(`Transaction successful! Tx Hash: ${receipt.hash}`)
        setTxHash(receipt.hash)
      } else {
        const contract = await getOftContract(currentLzChain.contractAddress, provider)
        const nativeFee = estimatedInfo.nativeFee

        setTxStatus(`[${currentLzChain.name}] => [${targetLzChain.name}] Sending XPLA OFT... `)

        const receipt = await (await contract.send(sendParam, [nativeFee, 0], recipient, { value: nativeFee })).wait()

        setTxStatus(`Transaction successful! Tx Hash: ${receipt.hash}`)
        setTxHash(receipt.hash)
      }

      setEstimatedInfo(undefined) 
      fetchBalance() // 잔액 갱신
    } catch (error: any) {
      console.error("Transaction failed:", error)
      setTxStatus(`Error: ${error.message}`)
    }
  }

  // 계정 연결 시 잔액 조회
  useEffect(() => {
    if (account && provider) {
      fetchBalance();
    }
  }, [account, provider]);

  return (
    <div className="App">
      <h1>LayerZero OFT DApp</h1>
      {!account ? (
        <div>
          <h2>Available Wallets</h2>
          {providers.length === 0 ? (
            <div className="mmError">
              No wallets detected. Please install a compatible wallet.
            </div>
          ) : (
            <div className="providers">
              {providers.map((p) => (
                <button
                  key={p.info.uuid}
                  onClick={() => connectWallet(p.provider)}
                >
                  <img src={p.info.icon} alt={p.info.name} />
                  {p.info.name}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="connected-info">
            <div>
              <span className="label">Connected Account:</span>
              <span className="value">{account}</span>
            </div>
            <div>
              <span className="label">Balance:</span>
              <span className="value">{balance} XPLA</span>
            </div>
          </div>

          <div>
            <label>{chainList.get(currentChain)!.name} ⮕ </label>
            <select
              value={targetChain}
              onChange={(e) => setTargetChain(e.target.value)}
            >
              {SUPPORTED_CHAINS.map((chain) => (
                <option key={chain.value} value={chain.value}>
                  {chain.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Recipient Address"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
            <input
              type="number"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              step="0.01"
            />
            <button onClick={estimateSendOftTokens}>Estimate Fee</button>
            <button onClick={sendOftTokens}>Send Tokens</button>
          </div>

          {txStatus && (
            <div id="status">
              {txStatus.split("\n").map((line, index) => (
                <div key={index}>{line}</div>
              ))}
            </div>
          )}

          {txHash && (
            <a
              href={`https://testnet.layerzeroscan.com/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="explorer-link"
            >
              View on LayerZero Explorer (Tx: {txHash.slice(0, 6)}...{txHash.slice(-4)})
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
