import Foundation

struct TeleprompterDraft: Identifiable, Codable, Equatable {
    var id: UUID
    var title: String
    var content: String
    var updatedAt: Date

    init(id: UUID = UUID(), title: String, content: String, updatedAt: Date = .now) {
        self.id = id
        self.title = title
        self.content = content
        self.updatedAt = updatedAt
    }
}

@MainActor
final class TeleprompterDraftStore: ObservableObject {
    @Published private(set) var drafts: [TeleprompterDraft] = []

    private let defaults: UserDefaults
    private let storageKey = "teleprompter.drafts.v1"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        load()
    }

    func save(_ draft: TeleprompterDraft) {
        var updated = draft
        updated.updatedAt = .now
        if let index = drafts.firstIndex(where: { $0.id == draft.id }) {
            drafts[index] = updated
        } else {
            drafts.append(updated)
        }
        sortAndPersist()
    }

    func delete(at offsets: IndexSet) {
        drafts.remove(atOffsets: offsets)
        persist()
    }

    func delete(_ draft: TeleprompterDraft) {
        drafts.removeAll { $0.id == draft.id }
        persist()
    }

    private func load() {
        guard let data = defaults.data(forKey: storageKey),
              let decoded = try? JSONDecoder().decode([TeleprompterDraft].self, from: data) else { return }
        drafts = decoded.sorted { $0.updatedAt > $1.updatedAt }
    }

    private func sortAndPersist() {
        drafts.sort { $0.updatedAt > $1.updatedAt }
        persist()
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(drafts) else { return }
        defaults.set(data, forKey: storageKey)
    }
}
