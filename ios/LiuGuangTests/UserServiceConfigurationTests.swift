import XCTest
@testable import LiuGuang

final class UserServiceConfigurationTests: XCTestCase {
    func testRecognizesFeishuBaseLink() {
        XCTAssertTrue(UserServiceConfiguration.isFeishuBaseURL(
            "https://example.feishu.cn/base/M6wDbEIkTaSfo2s2oz3cu8PDnHf?from=copylink"
        ))
    }

    func testRejectsNonBaseAndInsecureLinks() {
        XCTAssertFalse(UserServiceConfiguration.isFeishuBaseURL("https://example.feishu.cn/docx/abc"))
        XCTAssertFalse(UserServiceConfiguration.isFeishuBaseURL("http://example.feishu.cn/base/abc"))
        XCTAssertFalse(UserServiceConfiguration.isFeishuBaseURL("https://example.com/base/abc"))
    }
}
