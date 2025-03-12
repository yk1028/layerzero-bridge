// src/contract.ts
import { ethers } from "ethers";

import XplaOFTAbi from "../artifacts/XplaOFT/abi.json"
import XplaNativeOFTAdapterAbi from "../artifacts/XplaNativeOFTAdapter/abi.json"

export const getOftContract = async (contractAddress: string, provider: ethers.BrowserProvider) => {
  const signer = await provider.getSigner();
  return new ethers.Contract(contractAddress, XplaOFTAbi, signer);
};

export const getNativeOftAdapterContract = async (contractAddress: string, provider: ethers.BrowserProvider) => {
  const signer = await provider.getSigner();
  return new ethers.Contract(contractAddress, XplaNativeOFTAdapterAbi, signer);
};

