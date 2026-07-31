// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
}

contract InvoiceForwarder {
    address public factory;
    IERC20 public token;
    address public merchant;
    address public treasury;
    uint256 public feeBasisPoints;
    uint256 public maxFeeTokens;

    event ForwarderSwept(uint256 totalCollected, uint256 platformFee, uint256 merchantAmount);

    constructor(
        address _token,
        address _merchant,
        address _treasury,
        uint256 /* totalAmount */,
        uint256 _feeBasisPoints,
        uint256 _maxFeeTokens
    ) {
        factory = msg.sender; // factory deploys this contract via CREATE2
        token = IERC20(_token);
        merchant = _merchant;
        treasury = _treasury;
        feeBasisPoints = _feeBasisPoints;
        maxFeeTokens = _maxFeeTokens;
        // Do NOT transfer funds in the constructor. Funds will be swept explicitly by the factory calling `sweep()`.
    }

    /**
     * @dev Sweep any ERC20 balance held by this contract to the configured merchant and treasury.
     * Can only be called by the factory that deployed this forwarder.
     */
    function sweep() external {
        require(msg.sender == factory, "Only factory can trigger sweep");

        uint256 balance = token.balanceOf(address(this));
        require(balance > 0, "No funds to sweep");

        uint256 calculatedFee = (balance * feeBasisPoints) / 10000;
        uint256 platformFee = calculatedFee > maxFeeTokens ? maxFeeTokens : calculatedFee;
        uint256 merchantAmount = balance - platformFee;

        if (platformFee > 0) {
            require(token.transfer(treasury, platformFee), "Fee transfer failed");
        }
        require(token.transfer(merchant, merchantAmount), "Merchant transfer failed");

        emit ForwarderSwept(balance, platformFee, merchantAmount);
    }
}
