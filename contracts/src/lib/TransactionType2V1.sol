// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

library TransactionType2V1 {
    uint256 internal constant SEPOLIA_CHAIN_ID = 11_155_111;

    error UnsupportedTransactionType(uint8 txType);
    error UnsupportedChainId(uint256 chainId);
    error UnsupportedAccessList();
    error InvalidYParity(uint8 yParity);
    error CanonicalSourceTxMismatch(bytes32 claimedTxHash, bytes32 derivedSourceTx);

    struct NormalizedType2Transaction {
        uint8 txType;
        uint256 chainId;
        uint256 nonce;
        uint256 maxPriorityFeePerGas;
        uint256 maxFeePerGas;
        uint256 gasLimit;
        bool hasTo;
        address to;
        uint256 value;
        bytes input;
        uint256 accessListLength;
        uint8 yParity;
        uint256 r;
        uint256 s;
    }

    function reconstructSigned(NormalizedType2Transaction memory transaction) internal pure returns (bytes memory) {
        _validate(transaction);

        bytes[] memory fields = new bytes[](12);
        fields[0] = _encodeBytes(_minimalUnsigned(transaction.chainId));
        fields[1] = _encodeBytes(_minimalUnsigned(transaction.nonce));
        fields[2] = _encodeBytes(_minimalUnsigned(transaction.maxPriorityFeePerGas));
        fields[3] = _encodeBytes(_minimalUnsigned(transaction.maxFeePerGas));
        fields[4] = _encodeBytes(_minimalUnsigned(transaction.gasLimit));
        fields[5] = _encodeBytes(transaction.hasTo ? abi.encodePacked(transaction.to) : bytes(""));
        fields[6] = _encodeBytes(_minimalUnsigned(transaction.value));
        fields[7] = _encodeBytes(transaction.input);
        fields[8] = hex"c0";
        fields[9] = _encodeBytes(_minimalUnsigned(transaction.yParity));
        fields[10] = _encodeBytes(_minimalUnsigned(transaction.r));
        fields[11] = _encodeBytes(_minimalUnsigned(transaction.s));

        return bytes.concat(hex"02", _encodeList(fields));
    }

    function deriveCanonicalSourceTx(NormalizedType2Transaction memory transaction) internal pure returns (bytes32) {
        return keccak256(reconstructSigned(transaction));
    }

    function bindCanonicalSourceTx(NormalizedType2Transaction memory transaction, bytes32 claimedTxHash)
        internal
        pure
        returns (bytes32 derivedSourceTx)
    {
        derivedSourceTx = deriveCanonicalSourceTx(transaction);
        if (derivedSourceTx != claimedTxHash) {
            revert CanonicalSourceTxMismatch(claimedTxHash, derivedSourceTx);
        }
    }

    function _validate(NormalizedType2Transaction memory transaction) private pure {
        if (transaction.txType != 2) revert UnsupportedTransactionType(transaction.txType);
        if (transaction.chainId != SEPOLIA_CHAIN_ID) revert UnsupportedChainId(transaction.chainId);
        if (transaction.accessListLength != 0) revert UnsupportedAccessList();
        if (transaction.yParity > 1) revert InvalidYParity(transaction.yParity);
    }

    function _minimalUnsigned(uint256 value) private pure returns (bytes memory encoded) {
        if (value == 0) return bytes("");

        uint256 length;
        uint256 remaining = value;
        while (remaining != 0) {
            length++;
            remaining >>= 8;
        }

        encoded = new bytes(length);
        while (length != 0) {
            length--;
            encoded[length] = bytes1(uint8(value));
            value >>= 8;
        }
    }

    function _encodeBytes(bytes memory value) private pure returns (bytes memory) {
        if (value.length == 1 && uint8(value[0]) < 0x80) return value;
        return bytes.concat(_encodeLength(value.length, 0x80), value);
    }

    function _encodeList(bytes[] memory items) private pure returns (bytes memory) {
        bytes memory payload;
        for (uint256 index = 0; index < items.length; index++) {
            payload = bytes.concat(payload, items[index]);
        }
        return bytes.concat(_encodeLength(payload.length, 0xc0), payload);
    }

    function _encodeLength(uint256 length, uint8 offset) private pure returns (bytes memory) {
        if (length < 56) return abi.encodePacked(bytes1(offset + uint8(length)));

        bytes memory lengthBytes = _minimalUnsigned(length);
        return bytes.concat(abi.encodePacked(bytes1(offset + 55 + uint8(lengthBytes.length))), lengthBytes);
    }
}
