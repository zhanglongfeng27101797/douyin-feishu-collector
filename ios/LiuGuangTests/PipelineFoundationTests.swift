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

    func testDecodesFeishuRecordForCardAndDetail() throws {
        let fields = [
            FeishuField(name: "标题", type: 1),
            FeishuField(name: "话题标签", type: 4),
            FeishuField(name: "封面链接", type: 1),
            FeishuField(name: "采集时间", type: 5)
        ]
        let item: [String: Any] = [
            "record_id": "rec123",
            "created_time": "1786240800000",
            "last_modified_time": "1786240860000",
            "fields": [
                "标题": "母婴科普视频",
                "话题标签": ["孕期", "分娩"],
                "封面链接": "https://example.com/cover.jpg",
                "采集时间": 1_786_240_800_000
            ]
        ]

        let record = try XCTUnwrap(FeishuRecordDecoder.decode(item: item, fieldDefinitions: fields))
        XCTAssertEqual(record.id, "rec123")
        XCTAssertEqual(record.title, "母婴科普视频")
        XCTAssertEqual(record.field(named: "话题标签")?.values, ["孕期", "分娩"])
        XCTAssertEqual(record.coverURL?.absoluteString, "https://example.com/cover.jpg")
        XCTAssertNotNil(record.modifiedAt)
    }
}
