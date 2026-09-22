// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {MultiAwardRank} from "./libraries/MultiAwardRank.sol";
import {ScrambledRank} from "./libraries/ScrambledRank.sol";

/// @notice Immutable, storage-free SVG and metadata rendering. No owner, external assets or upgrade path.
contract ManekinekoRendererV8 {
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

    /// @notice One unbiased ordered sample without replacement; the round authenticates and freezes its VRF entropy.
    function drawWinners(bytes32 candidate, uint256 supply, uint256 count) external pure returns (bool, uint256[10] memory) {
        return MultiAwardRank.tryWinners(candidate, supply, count);
    }
    function rankToken(uint256 tokenId, uint256 supply, uint256[10] calldata winners, uint256 count) external pure returns (uint256) {
        return MultiAwardRank.rank(tokenId, supply, winners, count);
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
        string memory details = '"attributes":[{"trait_type":"Status","value":"Sealed"}]';
        if (revealed) {
            details = string.concat('"attributes":[', _trait("A", n[0]), ",", _trait("B", n[1]), ",", _trait("C", n[2]), ",", _trait("D", n[3]), ",", _trait("Combination code", ((n[0] - 1) << 12) | ((n[1] - 1) << 8) | ((n[2] - 1) << 4) | (n[3] - 1)), ",", _trait("Score", result), "]");
        } else if (refundable) {
            details = '"attributes":[{"trait_type":"Status","value":"Refundable"}]';
        }
        string memory svg = _artwork(appearance, tokenId, refundable, revealed, n, result, awardRank);
        return string.concat("data:application/json;base64,", Base64.encode(bytes(string.concat(
            '{"name":"', Strings.escapeJSON(appearance.collectionName), " #", tokenId.toString(),
            '","description":"Tincta color edition. Unique ranks from 1 to collection supply. Four numbers encode each rank with a reversible VRF-keyed permutation. Distinct highest-scoring NFTs receive equal prizes. ',
            'Verify the score with scoreCombination([a,b,c,d]) on this collection contract. Chainlink VRF proof verified on Ethereum. Transfers lock until reveal; each winning NFT remains locked until its own prize is claimed.",',
            '"artwork_version":"tincta-v2","contract_version":"affiliate-v8","algorithm_version":"unique-rank-v5","randomness_provider":"chainlink-vrf-v2.5",',
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

    // BEGIN GENERATED TINCTA MOTIFS
    bytes private constant MOTIFS = hex"6464000000c864646464c800c8c8646464640000c8006464646400c8c8c864640abe0a501e0a640a640aaa0abe50bebebebeaabe96be82be46be32be1ebe0abe008723003c00646464648cc8a5c8c84100641e32463c646464648c96af96c86464009b00c82dc864c864c89b9bc864c864c82dc8009b00640064002d2d00640064005a3c0050008c008c00be46c864c864c86e8cc878c83cc83cc80a820064006400645a645ac864c8646e646e6464c864c8646e646e006400645a645a64640064c800a000001e0064c8238c3214500a64c8a58c9614780a64c8c8a0c800aa0000641e46461e64006400821eaa46c86400c81eaa4682646464648282aaaac8c86464320000000064006400c832c8646464649600c800c864c864c8c896c8646464647d4b9664967d967d96af32af323232323200c800c864c864c8c800c8000000143c288ca0c8b400b43ca08c28c814003c50b47814c88c008c501478b4c83c64008521a642c864c864a68585a664c864c842a62185006400642142422164001400c81400b4b4c82800be1e0aaaa0c83c00b42814a08cc85000aa321e9678c8a0003200003c0064006400a064c8a0c8a0c85ab43caa3c643c643c286e1ea0003c0a5a0a6e0a8c0a8c0ac80ac8be8cbe8cbe6ebe5abe3cbe3cbe00be000a3c0a6400783c8c5ac8a0c8a082a046a000a000a03c6450326400640064326464649600b4009600003c283c283c50505a64006400785a8c508c288c28c800c896c8b464326400000000640064008c3cb464c864c88cb4c88cc864c864c800640064320014781478b4c8b4c8b450b450140014c814501450b400b400b478b47814c8146414c800c800b464b464c8c8c8c864b464b400c800c81464146400000000641400283c468c0ac82800a03c828cbec8a0280046640a6428c8a0008264be64a0c8000042008500c800c800c842c885c8c8c8c885c842c800c800c8008500420000";
    // END GENERATED TINCTA MOTIFS

    /// @notice Catalog seasons retain distinct motifs on both supported networks, even after renaming.
    /// Custom season IDs deterministically select from the same reviewed vocabulary.
    function artworkMotif(bytes32 identity) public pure returns (uint256) {
        for (uint256 i = 1; i <= 22; ++i) {
            string memory serial = i.toString();
            if (identity == sha256(abi.encodePacked("manekineko:seasons.json:chain:1:season:", serial)) ||
                identity == sha256(abi.encodePacked("manekineko:seasons.json:chain:11155111:season:", serial))) return i - 1;
        }
        return uint256(identity) % 22;
    }

    /// @dev Original curve constants and integer transforms; never used by scoring or randomness.
    function _linework(Appearance calldata a, uint256 tokenId, bool revealed, uint256[4] calldata n) private pure returns (string memory lines) {
        bytes memory points = MOTIFS;
        uint256 start = artworkMotif(a.seasonId) * 32;
        uint256 rgb;
        bytes memory color = bytes(a.collectionColor);
        for (uint256 i = 1; i < 7; ++i) {
            uint8 c = uint8(color[i]);
            rgb = rgb * 16 + (c <= 57 ? c - 48 : c <= 70 ? c - 55 : c - 87);
        }
        uint256 variation = (tokenId + (revealed ? n[0] * 3 + n[1] * 5 + n[2] * 7 + n[3] * 11 : 0)) % 3;
        int256 shear = int256((rgb & 255) / 16) - 8;
        for (uint256 layer; layer < 16; ++layer) {
            uint256 scale = 60 + layer * 3;
            int256 sx = int256((180 + (rgb >> 16) / 8 + variation) * scale / 100);
            int256 sy = int256((112 + ((rgb >> 8) & 255) / 12) * scale / 100);
            string memory path;
            for (uint256 point; point < 16; ++point) {
                int256 px = int256(uint256(uint8(points[start + point * 2]))) - 100;
                int256 py = int256(uint256(uint8(points[start + point * 2 + 1]))) - 100;
                uint256 x = uint256(320 + px * sx / 100 + py * shear / 100);
                uint256 y = uint256(350 + py * sy / 100);
                path = string.concat(path, point == 0 ? "M" : point % 4 == 0 ? " M" : point % 4 == 1 ? " C" : " ", x.toString(), " ", y.toString());
            }
            lines = string.concat(lines, '<path d="', path, '"/>');
        }
    }

    function _artwork(Appearance calldata a, uint256 tokenId, bool refundable, bool revealed, uint256[4] calldata n, uint256 result, uint256 award) private pure returns (string memory) {
        string memory serial = tokenId.toString();
        while (bytes(serial).length < 4) serial = string.concat("0", serial);
        string memory top = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800" viewBox="0 0 640 800"><rect width="640" height="800" fill="', a.collectionColor,
            '"/><g fill="', a.textColor, '" font-family="sans-serif"><text x="48" y="52" font-size="12" font-weight="500" letter-spacing="3">TINCTA</text><text x="592" y="52" font-family="monospace" font-size="12" text-anchor="end">No. ', serial,
            '</text><text x="48" y="112" font-size="', _fontSize(a.seasonName, 30, false), '" font-weight="500">', _escapeXML(a.seasonName),
            '</text><text x="48" y="148" font-family="monospace" font-size="', _fontSize(a.collectionName, 18, true), '">', _escapeXML(a.collectionName), '</text>'
        );
        string memory middle = string.concat(
            '<g fill="none" stroke="', a.textColor, '" stroke-width="1" opacity="0.6">', _linework(a, tokenId, revealed, n),
            '</g><path d="M58 202 L70 202 M64 196 L64 208 M570 202 L582 202 M576 196 L576 208 M58 502 L70 502 M64 496 L64 508 M570 502 L582 502 M576 496 L576 508 M48 548 L592 548 M48 742 L592 742" fill="none" stroke="', a.textColor, '" stroke-width="1" opacity="0.4"/><g font-family="monospace">'
        );
        for (uint256 i; i < 4; ++i) {
            string memory x = (48 + i * 144).toString();
            middle = string.concat(middle, '<text x="', x, '" y="585" font-size="11" letter-spacing="2">', string(abi.encodePacked(bytes1(uint8(65 + i)))), '</text><text x="', x, '" y="628" font-size="38">', revealed ? n[i].toString() : "--", '</text>');
        }
        string memory status = refundable ? "REFUNDABLE" : !revealed ? "SEALED" : award > 0 ? "WINNING EDITION" : "REVEALED";
        string memory note = refundable ? "Mint not completed" : !revealed ? "Awaiting reveal" : award > 0 ? string.concat("Award #", award.toString()) : "Verified on-chain";
        return string.concat(top, middle,
            '<text x="48" y="680" font-size="11" letter-spacing="2">SCORE</text><text x="48" y="712" font-size="24">', revealed ? result.toString() : "--",
            '</text></g><text x="592" y="680" font-size="11" letter-spacing="1" text-anchor="end">', status,
            '</text><text x="592" y="712" font-size="18" text-anchor="end">', note,
            '</text><text x="48" y="770" font-size="10" letter-spacing="2">COLOR, COLLECTED.</text><text x="592" y="770" font-family="monospace" font-size="10" text-anchor="end">', a.collectionColor, '</text></g></svg>'
        );
    }

    /// @dev Conservative glyph widths fit wide ASCII and UTF-8 names without external fonts.
    function _fontSize(string memory value, uint256 preferred, bool mono) private pure returns (string memory) {
        bytes memory data = bytes(value);
        uint256 units;
        for (uint256 i; i < data.length; ++i) {
            uint8 c = uint8(data[i]);
            if (c >= 128) { if (c >= 192) units += 1000; }
            else if (mono) units += 600;
            else if (c == 32) units += 300;
            else if (c == 77 || c == 87 || c == 64) units += 1050;
            else if (c == 109 || c == 119) units += 900;
            else if (c >= 65 && c <= 90) units += 850;
            else units += 650;
        }
        uint256 fit = units == 0 ? preferred : 540000 / units;
        return (preferred > fit ? fit : preferred).toString();
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
