// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {VRFV2PlusClient} from "../vendor/chainlink-vrf-v2.5/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface ITestVRFConsumer {
    function rawFulfillRandomWords(uint256 requestId, uint256[] calldata words) external;
}

/// @dev Test-only coordinator. It models subscription/payment/callback boundaries, not a VRF proof.
contract VRFCoordinatorV2Mock {
    uint96 public constant MOCK_FEE = 0.001 ether;
    uint256 public nextSubscriptionId = 1;
    uint256 public nextRequestId = 1;

    struct Subscription {
        uint96 nativeBalance;
        uint64 requestCount;
        address owner;
        address[] consumers;
    }

    struct Request {
        address consumer;
        VRFV2PlusClient.RandomWordsRequest parameters;
        bool fulfilled;
    }

    mapping(uint256 => Subscription) private subscriptions;
    mapping(uint256 => Request) private requests;
    mapping(uint256 => uint256) public pendingRequests;
    bool public lastCallbackSucceeded;
    uint256 public lastCallbackGasUsed;
    bool public requestFailure;

    error InvalidSubscription();
    error SubscriptionOwnerOnly();
    error InvalidConsumer();
    error InsufficientNativeBalance();
    error InvalidRequest();
    error NativePaymentRequired();
    error PendingRequest();
    error InjectedRequestFailure();
    error TransferFailed();

    event MockRequest(uint256 indexed requestId, address indexed consumer, uint256 indexed subId);
    event MockFulfilled(uint256 indexed requestId, bool success, uint256 callbackGasUsed);

    function createSubscription() external returns (uint256 subId) {
        subId = nextSubscriptionId++;
        subscriptions[subId].owner = msg.sender;
    }

    function getSubscription(uint256 subId) external view
        returns (uint96 balance, uint96 nativeBalance, uint64 reqCount, address owner, address[] memory consumers)
    {
        Subscription storage sub = _subscription(subId);
        return (0, sub.nativeBalance, sub.requestCount, sub.owner, sub.consumers);
    }

    function addConsumer(uint256 subId, address consumer) external {
        Subscription storage sub = _subscription(subId);
        if (msg.sender != sub.owner) revert SubscriptionOwnerOnly();
        if (consumer == address(0)) revert InvalidConsumer();
        if (_isConsumer(sub, consumer)) return;
        sub.consumers.push(consumer);
    }

    function fundSubscriptionWithNative(uint256 subId) external payable {
        Subscription storage sub = _subscription(subId);
        if (msg.value > type(uint96).max - sub.nativeBalance) revert InvalidRequest();
        sub.nativeBalance += uint96(msg.value);
    }

    function cancelSubscription(uint256 subId, address recipient) external {
        Subscription storage sub = _subscription(subId);
        if (msg.sender != sub.owner) revert SubscriptionOwnerOnly();
        if (pendingRequests[subId] != 0) revert PendingRequest();
        uint256 balance = sub.nativeBalance;
        delete subscriptions[subId];
        (bool success, ) = payable(recipient).call{value: balance}("");
        if (!success) revert TransferFailed();
    }

    function requestRandomWords(VRFV2PlusClient.RandomWordsRequest calldata parameters)
        external returns (uint256 requestId)
    {
        if (requestFailure) revert InjectedRequestFailure();
        Subscription storage sub = _subscription(parameters.subId);
        if (!_isConsumer(sub, msg.sender)) revert InvalidConsumer();
        if (parameters.keyHash == bytes32(0) || parameters.numWords != 1 || parameters.callbackGasLimit == 0)
            revert InvalidRequest();
        if (keccak256(parameters.extraArgs) != keccak256(
            VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({nativePayment: true}))
        )) revert NativePaymentRequired();
        requestId = nextRequestId++;
        requests[requestId].consumer = msg.sender;
        requests[requestId].parameters = parameters;
        ++pendingRequests[parameters.subId];
        emit MockRequest(requestId, msg.sender, parameters.subId);
    }

    function requestDetails(uint256 requestId) external view
        returns (address consumer, VRFV2PlusClient.RandomWordsRequest memory parameters, bool fulfilled)
    {
        Request storage request = requests[requestId];
        return (request.consumer, request.parameters, request.fulfilled);
    }

    /// @dev Like the service, a callback failure still consumes this request and its fee.
    function fulfillRequest(uint256 requestId, uint256 word) external returns (bool success) {
        Request storage request = requests[requestId];
        if (request.consumer == address(0) || request.fulfilled) revert InvalidRequest();
        Subscription storage sub = _subscription(request.parameters.subId);
        if (sub.nativeBalance < MOCK_FEE) revert InsufficientNativeBalance();
        sub.nativeBalance -= MOCK_FEE;
        request.fulfilled = true;
        uint256[] memory words = new uint256[](1);
        words[0] = word;
        bytes memory data = abi.encodeCall(ITestVRFConsumer.rawFulfillRandomWords, (requestId, words));
        uint256 gasBefore = gasleft();
        (success, ) = request.consumer.call{gas: request.parameters.callbackGasLimit}(data);
        lastCallbackGasUsed = gasBefore - gasleft();
        lastCallbackSucceeded = success;
        ++sub.requestCount;
        --pendingRequests[request.parameters.subId];
        emit MockFulfilled(requestId, success, lastCallbackGasUsed);
    }

    /// @dev Deliberately unrestricted fault injection, never a production coordinator feature.
    function deliver(address consumer, uint256 requestId, uint256[] calldata words) external {
        ITestVRFConsumer(consumer).rawFulfillRandomWords(requestId, words);
    }

    /// @dev Synthetic request-side coordinator failure, distinct from delayed underfunded fulfillment.
    function setRequestFailure(bool fail) external { requestFailure = fail; }

    function _subscription(uint256 subId) private view returns (Subscription storage sub) {
        sub = subscriptions[subId];
        if (sub.owner == address(0)) revert InvalidSubscription();
    }

    function _isConsumer(Subscription storage sub, address consumer) private view returns (bool) {
        for (uint256 i; i < sub.consumers.length; ++i) {
            if (sub.consumers[i] == consumer) return true;
        }
        return false;
    }
}

/// @dev Test-only smart wallet supporting safe mint, rejecting ETH, and reentrant callbacks.
contract V2RoundReceiver is IERC721Receiver {
    address public immutable targetRound;
    bool public rejectNative;
    bool public attackOnMint;
    bytes public attackData;
    uint256 public attackValue;
    uint256 public callbackAttempts;
    bool public callbackSucceeded;
    bytes public callbackResult;
    bool public observedSoldOut;

    constructor(address target) payable { targetRound = target; }

    function configure(bool reject, bool onMint, bytes calldata data, uint256 value) external {
        rejectNative = reject;
        attackOnMint = onMint;
        attackData = data;
        attackValue = value;
    }

    function execute(bytes calldata data) external payable returns (bytes memory result) {
        bool success;
        (success, result) = targetRound.call{value: msg.value}(data);
        if (!success) assembly ("memory-safe") { revert(add(result, 32), mload(result)) }
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        (bool success, bytes memory result) = targetRound.staticcall(abi.encodeWithSignature("soldOut()"));
        if (success) observedSoldOut = abi.decode(result, (bool));
        if (attackOnMint) _attempt();
        return IERC721Receiver.onERC721Received.selector;
    }

    receive() external payable {
        require(!rejectNative, "Native transfer rejected");
        if (!attackOnMint) _attempt();
    }

    function _attempt() private {
        if (attackData.length == 0) return;
        ++callbackAttempts;
        (callbackSucceeded, callbackResult) = targetRound.call{value: attackValue}(attackData);
    }
}
