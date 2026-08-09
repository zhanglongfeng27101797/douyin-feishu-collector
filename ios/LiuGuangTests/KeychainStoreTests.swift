import XCTest
@testable import LiuGuang

final class KeychainStoreTests: XCTestCase {
    func testCredentialRoundTripAndRemoval() throws {
        let service = "com.yuka.liuguang.tests.\(UUID().uuidString)"
        let store = KeychainStore(service: service)
        let account = "volcengine-api-key"
        let credential = "test-secret-\(UUID().uuidString)"

        XCTAssertNil(try store.value(for: account))
        try store.set(credential, for: account)
        XCTAssertEqual(
            try KeychainStore(service: service).value(for: account),
            credential
        )

        try store.remove(account)
        XCTAssertNil(try store.value(for: account))
    }

    func testCredentialCanBeUpdated() throws {
        let service = "com.yuka.liuguang.tests.\(UUID().uuidString)"
        let store = KeychainStore(service: service)
        let account = "volcengine-api-key"

        try store.set("first-value", for: account)
        try store.set("replacement-value", for: account)

        XCTAssertEqual(try store.value(for: account), "replacement-value")
        try store.remove(account)
    }
}
