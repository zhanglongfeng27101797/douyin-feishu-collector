import XCTest
@testable import LiuGuang

final class PipelineFoundationTests: XCTestCase {
    func testParsesBaseReferenceAndOptionalTable() throws {
        let withTable = try FeishuBaseReference(
            urlString: "https://example.feishu.cn/base/M6wDbEIkTaSfo2s2oz3cu8PDnHf?table=tbl123&view=vew1"
        )
        XCTAssertEqual(withTable.appToken, "M6wDbEIkTaSfo2s2oz3cu8PDnHf")
        XCTAssertEqual(withTable.tableID, "tbl123")

        let withoutTable = try FeishuBaseReference(
            urlString: "https://example.feishu.cn/base/appABC?from=copylink"
        )
        XCTAssertEqual(withoutTable.appToken, "appABC")
        XCTAssertNil(withoutTable.tableID)
    }

    func testTranscriptOnlyRemovesPlatformTail() {
        XCTAssertEqual(
            VolcengineSpeechClient.cleanTranscript("宝宝今天睡得很好。抖音记录美好生活。"),
            "宝宝今天睡得很好"
        )
        XCTAssertEqual(
            VolcengineSpeechClient.cleanTranscript("抖音上说这个方法不可取。"),
            "抖音上说这个方法不可取。"
        )
    }
}
