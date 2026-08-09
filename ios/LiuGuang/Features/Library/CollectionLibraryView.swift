import SwiftUI

struct CollectionLibraryView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 14) {
                statusHeader

                if let activeJob = model.jobs.first(where: { $0.status == .running || $0.status == .queued }) {
                    ActiveCollectionBanner(job: activeJob)
                }

                if model.collectionRecords.isEmpty && !model.isLoadingCollectionRecords {
                    ContentUnavailableView(
                        "采集库暂时为空",
                        systemImage: "rectangle.stack",
                        description: Text(model.collectionRecordsError ?? "采集完成的内容会自动出现在这里")
                    )
                    .frame(minHeight: 430)
                } else {
                    ForEach(model.collectionRecords) { record in
                        NavigationLink {
                            CollectionRecordDetailView(record: record)
                        } label: {
                            CollectionRecordCard(record: record)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("采集库")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await model.refreshCollectionRecords() }
                } label: {
                    if model.isLoadingCollectionRecords {
                        ProgressView()
                    } else {
                        Image(systemName: "arrow.clockwise")
                    }
                }
                .disabled(model.isLoadingCollectionRecords)
                .accessibilityLabel("刷新采集库")
            }
        }
        .refreshable { await model.refreshCollectionRecords() }
        .task {
            await model.refreshCollectionRecords()
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 20_000_000_000)
                if Task.isCancelled { break }
                await model.refreshCollectionRecords()
            }
        }
    }

    private var statusHeader: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text("\(model.collectionRecords.count) 条记录")
                    .font(.headline)
                if let updatedAt = model.collectionRecordsUpdatedAt {
                    Text("更新于 \(updatedAt.formatted(date: .omitted, time: .shortened))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Text("正在读取飞书多维表格")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            Label("飞书同步", systemImage: "checkmark.icloud")
                .font(.caption.weight(.medium))
                .foregroundStyle(model.collectionRecordsError == nil ? .green : .orange)
        }
        .padding(.top, 8)
    }
}

private struct CollectionRecordCard: View {
    let record: FeishuCollectionRecord

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            CoverImage(url: record.coverURL)
                .frame(width: 108, height: 138)

            VStack(alignment: .leading, spacing: 9) {
                HStack(alignment: .firstTextBaseline) {
                    Label(record.status, systemImage: statusIcon)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(statusColor)
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    if let highlight = record.highlight {
                        HighlightBadge(text: highlight)
                    }
                }

                Text(record.title)
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .lineLimit(2)

                if !record.sourceSummary.isEmpty {
                    Text(record.sourceSummary)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                if let benchmark = record.benchmark, !benchmark.isEmpty {
                    Text(benchmark)
                        .font(.caption)
                        .lineLimit(1)
                }

                if let tags = record.field(named: "话题标签")?.values, !tags.isEmpty {
                    Text(tags.prefix(3).map { "#\($0)" }.joined(separator: "  "))
                        .font(.caption)
                        .foregroundStyle(.blue)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
        .background(.background, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(.quaternary, lineWidth: 0.5)
        }
    }

    private var statusIcon: String {
        record.status.contains("成功") ? "checkmark.circle.fill" :
        record.status.contains("失败") ? "exclamationmark.triangle.fill" : "clock.fill"
    }

    private var statusColor: Color {
        record.status.contains("成功") ? .green :
        record.status.contains("失败") ? .red : .orange
    }
}

struct CoverImage: View {
    let url: URL?

    var body: some View {
        AsyncImage(url: url) { phase in
            switch phase {
            case .success(let image):
                image.resizable().scaledToFill()
            case .failure:
                placeholder
            case .empty:
                ZStack { Color.secondary.opacity(0.08); ProgressView() }
            @unknown default:
                placeholder
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var placeholder: some View {
        ZStack {
            Color.secondary.opacity(0.1)
            Image(systemName: "photo")
                .font(.title)
                .foregroundStyle(.secondary)
        }
    }
}

struct HighlightBadge: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .lineLimit(1)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.18), in: Capsule())
            .foregroundStyle(color)
    }

    private var color: Color {
        if text.contains("低粉") { return .red }
        if text.contains("高粉") { return .orange }
        if text.contains("潜力") { return .yellow }
        return .gray
    }
}

private struct ActiveCollectionBanner: View {
    let job: CollectionJob

    var body: some View {
        HStack(spacing: 12) {
            ProgressView()
            VStack(alignment: .leading, spacing: 3) {
                Text("正在采集")
                    .font(.subheadline.weight(.semibold))
                Text("\(job.stage.title) · \(job.progress ?? 0)%")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(12)
        .background(Color.accentColor.opacity(0.1), in: RoundedRectangle(cornerRadius: 14))
    }
}
