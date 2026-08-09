import SwiftUI
import UIKit

struct TeleprompterPlayerView: View {
    let text: String

    @Environment(\.dismiss) private var dismiss
    @State private var isPlaying = false
    @State private var speed = 34.0
    @State private var fontSize = 46.0
    @State private var countdown = 3
    @State private var textColor: Color = .white
    @State private var mirrored = false
    @State private var loop = false
    @State private var resetToken = UUID()
    @State private var showSettings = false

    private let colors: [Color] = [.white, .gray, .blue, .cyan, .green, .yellow, .orange, .pink]

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            AutoScrollingTextView(
                text: text,
                isPlaying: isPlaying,
                speed: speed,
                fontSize: fontSize,
                uiColor: UIColor(textColor),
                mirrored: mirrored,
                loop: loop,
                resetToken: resetToken
            )
            .ignoresSafeArea(edges: .bottom)

            if countdown > 0 {
                Color.black.opacity(0.55).ignoresSafeArea()
                Text("\(countdown)")
                    .font(.system(size: 92, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
            }

            VStack {
                HStack(spacing: 18) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                    Spacer()
                    Button { fontSize = max(24, fontSize - 4) } label: { Image(systemName: "textformat.size.smaller") }
                    Button { fontSize = min(90, fontSize + 4) } label: { Image(systemName: "textformat.size.larger") }
                    Button { showSettings.toggle() } label: { Image(systemName: "gearshape") }
                }
                .font(.title2)
                .foregroundStyle(.white)
                .padding()

                Spacer()

                HStack(spacing: 28) {
                    Button {
                        resetToken = UUID()
                        isPlaying = false
                        startCountdown()
                    } label: { Image(systemName: "backward.end.fill") }
                    Button { isPlaying.toggle() } label: {
                        Image(systemName: isPlaying ? "pause.circle.fill" : "play.circle.fill")
                            .font(.system(size: 54))
                    }
                    Button { showSettings.toggle() } label: { Image(systemName: "slider.horizontal.3") }
                }
                .font(.title2)
                .foregroundStyle(.white)
                .padding(.horizontal, 28)
                .padding(.vertical, 12)
                .background(.black.opacity(0.65), in: Capsule())
                .padding(.bottom, 18)
            }
        }
        .statusBarHidden(true)
        .persistentSystemOverlays(.hidden)
        .sheet(isPresented: $showSettings) {
            NavigationStack {
                Form {
                    Section("滚动") {
                        LabeledContent("滚动速度") {
                            Slider(value: $speed, in: 8...100)
                                .frame(maxWidth: 220)
                        }
                        Toggle("循环播放", isOn: $loop)
                    }
                    Section("文字") {
                        LabeledContent("字体大小") {
                            Slider(value: $fontSize, in: 24...90)
                                .frame(maxWidth: 220)
                        }
                        HStack {
                            Text("字体颜色")
                            Spacer()
                            ForEach(Array(colors.enumerated()), id: \.offset) { _, color in
                                Circle()
                                    .fill(color)
                                    .frame(width: 27, height: 27)
                                    .overlay {
                                        if color == textColor {
                                            Image(systemName: "checkmark")
                                                .font(.caption.bold())
                                                .foregroundStyle(color == .white ? .black : .white)
                                        }
                                    }
                                    .onTapGesture { textColor = color }
                            }
                        }
                        Toggle("镜像模式", isOn: $mirrored)
                    }
                    Section("开始") {
                        Stepper("倒计时：\(countdown == 0 ? 3 : countdown) 秒", value: $countdown, in: 0...10)
                        Button("从头重新开始") {
                            resetToken = UUID()
                            isPlaying = false
                            showSettings = false
                            startCountdown()
                        }
                    }
                }
                .navigationTitle("提词设置")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("完成") { showSettings = false }
                    }
                }
            }
            .presentationDetents([.medium, .large])
        }
        .task { startCountdown() }
    }

    private func startCountdown() {
        countdown = 3
        Task {
            while countdown > 0 {
                try? await Task.sleep(for: .seconds(1))
                countdown -= 1
            }
            isPlaying = true
        }
    }
}

private struct AutoScrollingTextView: UIViewRepresentable {
    let text: String
    let isPlaying: Bool
    let speed: Double
    let fontSize: Double
    let uiColor: UIColor
    let mirrored: Bool
    let loop: Bool
    let resetToken: UUID

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> UITextView {
        let view = UITextView()
        view.backgroundColor = .black
        view.isEditable = false
        view.isSelectable = false
        view.showsVerticalScrollIndicator = false
        view.textContainerInset = UIEdgeInsets(top: 100, left: 38, bottom: 220, right: 38)
        context.coordinator.view = view
        context.coordinator.startDisplayLink()
        return view
    }

    func updateUIView(_ view: UITextView, context: Context) {
        view.text = text
        view.font = .systemFont(ofSize: fontSize, weight: .medium)
        view.textColor = uiColor
        view.transform = mirrored ? CGAffineTransform(scaleX: -1, y: 1) : .identity
        context.coordinator.isPlaying = isPlaying
        context.coordinator.speed = speed
        context.coordinator.loop = loop
        if context.coordinator.resetToken != resetToken {
            context.coordinator.resetToken = resetToken
            view.setContentOffset(.zero, animated: false)
        }
    }

    final class Coordinator {
        weak var view: UITextView?
        var displayLink: CADisplayLink?
        var isPlaying = false
        var speed = 34.0
        var loop = false
        var resetToken: UUID?
        private var lastTimestamp: CFTimeInterval = 0

        func startDisplayLink() {
            displayLink = CADisplayLink(target: self, selector: #selector(tick(_:)))
            displayLink?.add(to: .main, forMode: .common)
        }

        @objc private func tick(_ link: CADisplayLink) {
            guard isPlaying, let view else {
                lastTimestamp = link.timestamp
                return
            }
            let delta = lastTimestamp == 0 ? 0 : link.timestamp - lastTimestamp
            lastTimestamp = link.timestamp
            let maximum = max(0, view.contentSize.height - view.bounds.height)
            let next = view.contentOffset.y + CGFloat(speed * delta)
            if next >= maximum {
                if loop { view.setContentOffset(.zero, animated: false) }
                else { isPlaying = false }
            } else {
                view.setContentOffset(CGPoint(x: 0, y: next), animated: false)
            }
        }

        deinit { displayLink?.invalidate() }
    }
}
