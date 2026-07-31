// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./InvoiceForwarder.sol";

contract InvoiceFactory {
    address public treasury;
    uint256 public constant FEE_BASIS_POINTS = 80; // 0.8%
    uint256 public constant MAX_FEE_USDC = 5 * 10**6; // $5.00 capped (assuming 6 decimals)

    event InvoiceSettled(
        string indexed invoiceId, 
        address indexed merchant, 
        uint256 totalReceived, 
        uint256 feeDeducted
    );

    constructor(address _treasury) {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
    }

    /**
     * @dev Predicts the CREATE2 address of an InvoiceForwarder before deployment
     */
    function predictInvoiceAddress(
        address merchant,
        string calldata invoiceId,
        uint256 expectedAmount
    ) external view returns (address) {
        bytes32 salt = keccak256(abi.encodePacked(merchant, invoiceId, expectedAmount));
        bytes memory bytecode = getBytecode(merchant, expectedAmount);
        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(bytecode))
        );
        return address(uint160(uint256(hash)));
    }

    /**
     * @dev Deploys the forwarder contract using CREATE2 and triggers automatic fund sweeping
     */
    function deployAndSweep(
        address merchant,
        string calldata invoiceId,
        uint256 expectedAmount,
        address token
    ) external returns (address forwarderAddress) {
        bytes32 salt = keccak256(abi.encodePacked(merchant, invoiceId, expectedAmount));
        bytes memory bytecode = getBytecode(merchant, expectedAmount);

        // Deploy contract via assembly CREATE2
        assembly {
            forwarderAddress := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
            if iszero(extcodesize(forwarderAddress)) {
                revert(0, 0)
            }
        }

        // Read deposited balance before triggering the sweep
        uint256 totalCollected = IERC20(token).balanceOf(forwarderAddress);
        require(totalCollected > 0, "No funds deposited in forwarder");

        // Trigger the forwarder to sweep funds to merchant and treasury
        (bool ok, ) = forwarderAddress.call(abi.encodeWithSignature("sweep()"));
        require(ok, "Forwarder sweep failed");

        uint256 fee = (totalCollected * FEE_BASIS_POINTS) / 10000;
        if (fee > MAX_FEE_USDC) fee = MAX_FEE_USDC;

        emit InvoiceSettled(invoiceId, merchant, totalCollected, fee);
    }

    function getBytecode(address merchant, uint256 expectedAmount) public view returns (bytes memory) {
        return abi.encodePacked(
            type(InvoiceForwarder).creationCode,
            abi.encode(
                0x75FAf114eAFb1bdBE23224eC7530404B110a4235, // USDC Sepolia Contract
                merchant,
                0x62f0072F397Eb73D75da7502F5E9394a83C450b9, // Treasury Address
                expectedAmount,
                FEE_BASIS_POINTS,
                MAX_FEE_USDC
            )
        );
    }
}
