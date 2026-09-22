// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ScrambledRank} from "./libraries/ScrambledRank.sol";

/// @notice Immutable, storage-free SVG and metadata rendering. No owner, external assets or upgrade path.
contract ManekinekoRendererV7 {
    using Strings for uint256;
    struct Appearance { bytes32 seasonId; string seasonName; string collectionName; string collectionColor; string textColor; }
    error InvalidAppearance();
    error InvalidConfig();
    error UnsupportedChain();

    /// @dev Shared immutable constructor checks keep every round's creation template below EIP-170.
    /// terms: supply, price, prize bps, pool bps, slots, deadline, confirmations, callback gas.
    /// addresses: owner, enrollment signer, eligibility registry, VRF coordinator.
    function validateTerms(uint256[8] calldata t, address[4] calldata a, bytes32 keyHash) external view {
        if (t[0] == 0 || t[0] > 65_536 || t[1] < 10_000 || t[1] % 10_000 != 0 ||
            t[2] > 10_000 || t[3] > 10_000 || t[2] + t[3] > 10_000 || t[4] == 0 || t[4] > 100 ||
            a[1] == address(0) || a[1] == a[0] || a[1].code.length != 0 || a[2].code.length == 0 ||
            t[1] > type(uint256).max / t[0] || t[5] <= block.timestamp || a[3].code.length == 0 ||
            keyHash == bytes32(0) || t[6] < 64 || t[6] > 200 || t[7] < 100_000 || t[7] > 2_500_000) revert InvalidConfig();
        // Reviewed Ethereum networks only; local mocks cannot pass this validation on Mainnet.
        if (block.chainid == 1) {
            if (a[3] != 0xD7f86b4b8Cae7D942340FF628F82735b7a20893a ||
                keyHash != 0x8077df514608a09f83e4e8d300645594e5d7234665448ba83f51a50f842bd3d9) revert InvalidConfig();
        } else if (block.chainid == 11155111) {
            if (a[3] != 0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B ||
                keyHash != 0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae) revert InvalidConfig();
        } else if (block.chainid != 31337) revert UnsupportedChain();
    }

    /// @notice Contrast is selected before deployment; immutable colors have no executable content.
    function validateAppearance(string calldata seasonName, string calldata collectionName, string calldata collectionColor, string calldata textColor) external pure {
        _validateName(bytes(seasonName), 64);
        _validateName(bytes(collectionName), 80);
        bytes memory color = bytes(collectionColor);
        if (color.length != 7 || color[0] != "#") revert InvalidAppearance();
        for (uint256 i = 1; i < 7; ++i) {
            bytes1 c = color[i];
            if (!((c >= "0" && c <= "9") || (c >= "A" && c <= "F") || (c >= "a" && c <= "f"))) revert InvalidAppearance();
        }
        bytes32 foreground = keccak256(bytes(textColor));
        if (foreground != keccak256("#000000") && foreground != keccak256("#FFFFFF")) revert InvalidAppearance();
    }

    /// @notice Encodes an already selected zero-based rank into its displayed combination.
    /// @dev Pure display math is shared here to keep each immutable round deployment small.
    function encodeCombination(uint256 rankCode, bytes32 key)
        external pure returns (uint256[4] memory numbers, uint256 code)
    {
        code = ScrambledRank.encode(rankCode, key);
        numbers = ScrambledRank.numbers(code);
    }

    /// @notice Reverses the display encoding and rejects ranks outside the collection supply.
    function scoreCombination(uint256[4] calldata numbers, bytes32 key, uint256 supply)
        external pure returns (uint256)
    {
        return ScrambledRank.score(numbers, key, supply);
    }

    function tokenURI(Appearance calldata appearance, uint256 tokenId, bool refundable, bool revealed, uint256[4] calldata n, uint256 result, uint256 awardRank, uint256 awardAmount)
        external pure returns (string memory)
    {
        string memory label = refundable ? "Refund available" : "Sealed until VRF reveal";
        string memory scoreLine = "";
        string memory details = '"attributes":[{"trait_type":"Status","value":"Sealed"}]';
        if (revealed) {
            label = string.concat(n[0].toString(), " / ", n[1].toString(), " / ", n[2].toString(), " / ", n[3].toString());
            scoreLine = string.concat('<text x="48" y="380" font-size="18">SCORE ', result.toString(), '</text>');
            details = string.concat('"attributes":[', _trait("A", n[0]), ",", _trait("B", n[1]), ",", _trait("C", n[2]), ",", _trait("D", n[3]), ",", _trait("Combination code", ((n[0] - 1) << 12) | ((n[1] - 1) << 8) | ((n[2] - 1) << 4) | (n[3] - 1)), ",", _trait("Score", result), "]");
        } else if (refundable) {
            details = '"attributes":[{"trait_type":"Status","value":"Refundable"}]';
        }
        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">',
            '<rect width="640" height="640" fill="', appearance.collectionColor, '"/><g fill="', appearance.textColor, '" font-family="monospace">',
            _nameText(appearance.seasonName, "80", 24), _nameText(appearance.collectionName, "128", 18),
            '<text x="48" y="300" font-size="24">', label, '</text>', scoreLine,
            '<text x="48" y="550" font-size="18">TOKEN #', tokenId.toString(), '</text></g></svg>'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(string.concat(
            '{"name":"', Strings.escapeJSON(appearance.collectionName), " #", tokenId.toString(),
            '","description":"Unique ranks from 1 to collection supply. Four numbers encode each rank with a reversible VRF-keyed permutation. Two distinct winning NFTs. ',
            'Verify the score with scoreCombination([a,b,c,d]) on this collection contract. Chainlink VRF proof verified on Ethereum. Transfers lock until reveal; each winning NFT remains locked until its own prize is claimed.",',
            '"contract_version":"affiliate-v7","algorithm_version":"unique-rank-v4","randomness_provider":"chainlink-vrf-v2.5",',
            '"season_id":"', Strings.toHexString(uint256(appearance.seasonId), 32), '","season_name":"', Strings.escapeJSON(appearance.seasonName),
            '","collection_name":"', Strings.escapeJSON(appearance.collectionName), '","collection_color":"', appearance.collectionColor,
            '","text_color":"', appearance.textColor, '","background_color":"', _backgroundColor(appearance.collectionColor), '",',
            '"award_rank":', awardRank.toString(), ',"prize_amount_wei":"', awardAmount.toString(), '","image":"data:image/svg+xml;base64,', Base64.encode(bytes(svg)), '",', details, "}"
        ))));
    }

    function _backgroundColor(string memory color) private pure returns (string memory) {
        bytes memory input = bytes(color); bytes memory output = new bytes(6);
        for (uint256 i; i < 6; ++i) output[i] = input[i + 1];
        return string(output);
    }

    function _nameText(string memory value, string memory y, uint256 size) private pure returns (string memory) {
        // Fit long UTF-8 names inside the artwork instead of clipping them at the edge.
        uint256 fit = 860 / bytes(value).length;
        if (size > fit) size = fit;
        return string.concat('<text x="48" y="', y, '" font-size="', size.toString(), '">', _escapeXML(value), '</text>');
    }

    function _validateName(bytes memory value, uint256 maxLength) private pure {
        if (value.length == 0 || value.length > maxLength) revert InvalidAppearance();
        for (uint256 i; i < value.length; ++i) {
            uint8 c = uint8(value[i]);
            if (c < 32 || c == 127) revert InvalidAppearance();
            if (c < 128) continue;
            uint256 trailing = c >= 0xC2 && c <= 0xDF ? 1 : c >= 0xE0 && c <= 0xEF ? 2 : c >= 0xF0 && c <= 0xF4 ? 3 : 0;
            if (trailing == 0 || i + trailing >= value.length) revert InvalidAppearance();
            uint8 next = uint8(value[i + 1]);
            if ((c == 0xE0 && next < 0xA0) || (c == 0xED && next >= 0xA0) ||
                (c == 0xF0 && next < 0x90) || (c == 0xF4 && next >= 0x90)) revert InvalidAppearance();
            if (c == 0xEF && next == 0xBF && uint8(value[i + 2]) >= 0xBE) revert InvalidAppearance();
            for (uint256 j; j < trailing; ++j) {
                uint8 continuation = uint8(value[++i]);
                if (continuation < 0x80 || continuation > 0xBF) revert InvalidAppearance();
            }
        }
    }

    function _escapeXML(string memory value) private pure returns (string memory) {
        bytes memory input = bytes(value); bytes memory output = new bytes(input.length * 6); uint256 length;
        for (uint256 i; i < input.length; ++i) {
            bytes memory escaped;
            if (input[i] == "&") escaped = bytes("&amp;");
            else if (input[i] == "<") escaped = bytes("&lt;");
            else if (input[i] == ">") escaped = bytes("&gt;");
            else if (input[i] == '"') escaped = bytes("&quot;");
            else if (input[i] == "'") escaped = bytes("&apos;");
            else { output[length++] = input[i]; continue; }
            for (uint256 j; j < escaped.length; ++j) output[length++] = escaped[j];
        }
        assembly ("memory-safe") { mstore(output, length) }
        return string(output);
    }

    function _trait(string memory key, uint256 value) private pure returns (string memory) {
        return string.concat('{"trait_type":"', key, '","value":', value.toString(), "}");
    }
}
