import {
    time,
    loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { expect } from "chai"
import { encodeBytes32String } from "ethers"
import { ethers } from "hardhat"

const FIVE_MINUTES = 60 * 5

const scoreHash = (score: bigint, nullifier: bigint) =>
    ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [score, nullifier]),
    )

describe("JudgePanel", function () {
    async function deployJudgePanel() {
        const [owner, otherAccount] = await ethers.getSigners()

        const JudgePanel = await ethers.getContractFactory("JudgePanel")
        const judgePanel = await JudgePanel.deploy()

        return { judgePanel, owner, otherAccount }
    }

    describe("Core logic", function () {
        it("Judges can be set", async function () {
            const { judgePanel, owner, otherAccount } = await loadFixture(
                deployJudgePanel,
            )

            await judgePanel.init(encodeBytes32String("my proposal"), [
                owner,
                otherAccount,
            ])

            const ownerIsAJudge = await judgePanel.isJudge(owner)
            const otherIsAJudge = await judgePanel.isJudge(otherAccount)

            expect(ownerIsAJudge).to.eq(true)
            expect(otherIsAJudge).to.eq(true)
        })

        it("Commitments work", async function () {
            const { judgePanel, owner, otherAccount } = await loadFixture(
                deployJudgePanel,
            )

            await judgePanel.init(encodeBytes32String("my proposal"), [
                owner,
                otherAccount,
            ])

            await expect(
                judgePanel.connect(owner).commitScore(scoreHash(4n, 5n)),
            ).not.to.be.reverted

            await expect(
                judgePanel.connect(otherAccount).commitScore(scoreHash(9n, 1n)),
            ).not.to.be.reverted
        })

        it("Reveals work", async function () {
            const { judgePanel, owner, otherAccount } = await loadFixture(
                deployJudgePanel,
            )

            await judgePanel.init(encodeBytes32String("my proposal"), [
                owner,
                otherAccount,
            ])

            await judgePanel.connect(owner).commitScore(scoreHash(4n, 1n))
            await judgePanel
                .connect(otherAccount)
                .commitScore(scoreHash(6n, 2n))

            await expect(judgePanel.startReveal()).to.be.reverted

            await time.increase(FIVE_MINUTES + 1)
            await judgePanel.startReveal()

            await expect(judgePanel.connect(owner).revealScore(4n, 1n)).not.to
                .be.reverted

            await expect(judgePanel.connect(otherAccount).revealScore(5n, 1n))
                .to.be.reverted
        })

        it("Calculates the right median", async function () {
            const { judgePanel, owner, otherAccount } = await loadFixture(
                deployJudgePanel,
            )

            await judgePanel.init(encodeBytes32String("my proposal"), [
                owner,
                otherAccount,
            ])

            await judgePanel.connect(owner).commitScore(scoreHash(4n, 1n))
            await judgePanel
                .connect(otherAccount)
                .commitScore(scoreHash(6n, 2n))

            await time.increase(FIVE_MINUTES + 1)
            await judgePanel.startReveal()

            await judgePanel.connect(owner).revealScore(4n, 1n)

            await expect(judgePanel.finalize()).to.be.reverted

            await judgePanel.connect(otherAccount).revealScore(6n, 2n)

            await judgePanel.finalize()

            expect(await judgePanel.getMedian()).to.eq(5n)
        })
    })
})
