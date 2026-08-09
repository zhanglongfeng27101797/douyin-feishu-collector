import SwiftUI

struct TaskListView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Group {
            if model.jobs.isEmpty {
                ContentUnavailableView(
                    "还没有采集任务",
                    systemImage: "tray",
                    description: Text("粘贴一条抖音分享内容开始采集")
                )
            } else {
                List(model.jobs) { job in
                    NavigationLink {
                        TaskDetailView(job: job)
                    } label: {
                        TaskRow(job: job)
                    }
                }
                .refreshable { await model.refreshJobs() }
            }
        }
        .navigationTitle("任务")
        .task { await model.refreshJobs() }
        .overlay(alignment: .bottom) {
            if let error = model.lastError {
                Text(error)
                    .font(.footnote)
                    .padding(10)
                    .background(.red.opacity(0.9), in: Capsule())
                    .foregroundStyle(.white)
                    .padding()
            }
        }
    }
}

private struct TaskRow: View {
    let job: CollectionJob

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(job.title?.isEmpty == false ? job.title! : "抖音采集任务")
                .font(.headline)
                .lineLimit(2)
            HStack {
                Label(job.status.title, systemImage: icon)
                    .foregroundStyle(color)
                Spacer()
                Text(job.stage.title).foregroundStyle(.secondary)
            }
            if job.status == .running || job.status == .queued {
                ProgressView(value: Double(job.progress ?? 0), total: 100)
            }
        }
        .padding(.vertical, 4)
    }

    private var icon: String {
        switch job.status {
        case .queued: "clock"
        case .running: "arrow.triangle.2.circlepath"
        case .retryWait: "clock.arrow.circlepath"
        case .succeeded: "checkmark.circle.fill"
        case .failed: "exclamationmark.triangle.fill"
        }
    }

    private var color: Color {
        switch job.status {
        case .succeeded: .green
        case .failed: .red
        case .retryWait: .orange
        default: Color.accentColor
        }
    }
}

