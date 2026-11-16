# Ghi chú về AI và quá trình xây dựng / AI collaboration note

## Tiếng Việt

### Minh bạch về mã nguồn

Đây là dự án do chủ dự án định hướng và đưa ra yêu cầu. AI đã hỗ trợ đọc cấu trúc dự án, đề xuất và chỉnh sửa một số phần mã, giao diện, xử lý dữ liệu và SQL theo các yêu cầu đó. Vì vậy, một phần mã hiện tại có sự hỗ trợ tạo/sửa từ AI; tài liệu này không khẳng định toàn bộ mã do riêng chủ dự án tự viết.

### Những việc bạn đã làm được trong quá trình làm việc với AI

- Mô tả được mục tiêu sản phẩm: website luyện C++20, chạy test cục bộ, lưu tiến độ và có bảng xếp hạng.
- Chia yêu cầu lớn thành các phần cụ thể: quyền thành viên/Admin, lịch sử code đúng và sai, hồ sơ, đổi tên có giới hạn, điều hướng trên điện thoại và trang thành viên/bài nộp.
- Nêu rõ ràng buộc quan trọng như không gửi code lên dịch vụ biên dịch trực tuyến và không cho xem code bài chưa hoàn thành.
- Phát hiện khi kết quả chưa xuất hiện như mong đợi, phản hồi trực tiếp và yêu cầu sửa tiếp.
- Đưa ảnh tham khảo nhưng vẫn yêu cầu giữ phong cách và bố cục phù hợp với website hiện có.
- Tiếp tục góp ý chi tiết về avatar, độ gọn của tiến độ, cách xác nhận email và trải nghiệm điều hướng.
- Đề xuất cho phép tải avatar, thu tiến độ thành dải vuốt ngang, và yêu cầu xử lý email đăng ký trùng mà không tự đặt giới hạn gửi lại.

### Nhận xét

Qua cách bạn giao việc trong cuộc trao đổi này, bạn đã biết dùng AI như một cộng sự để phân tích yêu cầu, xây dựng từng phần và phản hồi dựa trên kết quả. Điểm mạnh là bạn nêu mục tiêu và quyền hạn khá rõ, đồng thời không ngại yêu cầu làm lại khi trải nghiệm chưa đạt. Để kiểm soát dự án tốt hơn nữa, hãy tiếp tục yêu cầu tiêu chí nghiệm thu cụ thể, xem lại thay đổi trong IDE, chạy thử các luồng chính và kiểm tra migration trên môi trường thử trước khi áp dụng dữ liệu thật.

## English

### Source-code disclosure

The project owner sets the direction and requirements. AI assisted with inspecting the project and proposing or editing selected code, interface, data-handling, and SQL changes in response. Some current code was therefore generated or modified with AI assistance; this note does not claim that all code was written solely by the project owner.

### What you accomplished while working with AI

- You described the product goal: a C++20 practice website with local test execution, saved progress, and a leaderboard.
- You broke a broad goal into concrete needs: member/Admin permissions, correct and incorrect code history, profiles, rate-limited renaming, mobile navigation, and separate member/submission pages.
- You stated important constraints, including keeping source code away from online compiler services and hiding code for unfinished exercises.
- You noticed when the result did not match what you expected, gave direct feedback, and asked for another iteration.
- You supplied visual references while asking that the result still fit the existing website.
- You continued to give specific feedback on avatars, compact progress display, email confirmation, and navigation.
- You requested avatar uploads, a swipeable progress rail, and duplicate-signup handling without an app-imposed resend cooldown.

### Assessment

Based on this collaboration, you already use AI effectively as a project partner: you communicate goals, break work into features, set constraints, and review the outcome. Your strongest habits are clear product direction and direct feedback. To strengthen your process further, keep defining acceptance criteria, inspect changes in your IDE, exercise the main user flows, and validate database migrations in a staging environment before applying them to live data.
