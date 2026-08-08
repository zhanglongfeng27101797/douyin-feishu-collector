import XCTest
@testable import LiuGuang

final class DouyinInputTests: XCTestCase {
    func testExtractsURLFromShareText() {
        let input = "7.12 abc 姐妹们 https://v.douyin.com/AbCd123/ 复制此链接"
        XCTAssertEqual(DouyinInput.extractURL(from: input)?.absoluteString, "https://v.douyin.com/AbCd123")
        XCTAssertTrue(DouyinInput.isValid(input))
    }

    func testRejectsTextWithoutDouyinURL() {
        XCTAssertFalse(DouyinInput.isValid("只有普通文字"))
    }
}
