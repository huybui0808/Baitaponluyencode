# ONLUYENC++

ONLUYENC++ là website luyện lập trình C++20, hướng đến người học từ nhập môn đến các chủ đề nâng cao. Website cung cấp danh sách bài tập theo phần, đề bài, ví dụ, test mẫu, trình biên dịch chạy trong trình duyệt, lưu tiến độ, hồ sơ thành viên, bảng xếp hạng và công cụ quản trị bài tập.

## Chấm bài và quyền riêng tư

- Chương trình C++ được biên dịch và chạy bằng WebAssembly trong trình duyệt, không gửi mã nguồn đến dịch vụ biên dịch trực tuyến.
- Khi chấm một bài, website chạy toàn bộ test được cấu hình cho bài đó và tổng hợp kết quả. Chạy thử input riêng không cập nhật điểm bài.
- Bộ chấm phân biệt kết quả đúng, sai, lỗi biên dịch, lỗi chạy, quá thời gian và trường hợp đúng thuật toán nhưng sai cách trình bày.
- Test mẫu giúp người học tự kiểm tra. Vì chương trình và dữ liệu chấm chạy phía trình duyệt, đây là công cụ luyện tập; không nên dùng làm hệ thống thi có test bí mật.
- Supabase phục vụ tài khoản, tiến độ, lịch sử nộp và danh mục bài đã xuất bản. Quyền đọc mã nguồn bài nộp cần được bảo vệ bằng chính sách/RPC phía cơ sở dữ liệu.

## Thành phần chính

- `index.html`, `css/`, `js/`: giao diện, điều hướng, trình soạn thảo và logic ứng dụng.
- `data/part*.json`: bộ bài tập dự phòng cho chế độ offline; `data/manifest.json` khai báo các phần.
- `workers/`, `vendor/cpp-compiler/`: Web Worker và compiler C++20 chạy tại thiết bị.
- `sw.js`: cache tài nguyên để hỗ trợ sử dụng offline sau lần tải đầu.
- `cloudflare-worker.js`, `wrangler.jsonc`: phục vụ tài nguyên compiler lớn trên Cloudflare.

Không đưa khóa bí mật, file môi trường, dữ liệu tài khoản, SQL quản trị hoặc tài liệu nội bộ lên repository công khai. Publishable key phía trình duyệt không thay thế chính sách RLS; không đặt service-role key ở frontend.

## Vai trò của AI và quản trị viên

Quản trị viên xác định mục tiêu, quy tắc sản phẩm, nội dung bài, tiêu chí chấm và duyệt kết quả. AI đã hỗ trợ đọc cấu trúc dự án, đề xuất và sửa một số phần giao diện, JavaScript, dữ liệu bài tập, kiểm tra và tài liệu theo yêu cầu. Không thể đưa ra tỷ lệ phần trăm đáng tin cậy cho lượng mã do AI tạo nếu không có quy trình đo nguồn gốc từng dòng; vì vậy dự án không tự công bố một con số phần trăm. Quản trị viên chịu trách nhiệm xem xét, thử nghiệm và quyết định phát hành thay đổi.

## Thêm bài

Bài mới được quản trị viên nhập qua công cụ quản lý hoặc thêm vào một file JSON phần mới. Khi dùng offline, cập nhật manifest và đưa JSON cùng các tài nguyên cần thiết vào bản phát hành. Khi dùng online, bài cần được xuất bản vào Supabase. Xem cấu trúc hiện hành trong `data/part1.json` đến `data/part5.json` trước khi tạo dữ liệu mới.
