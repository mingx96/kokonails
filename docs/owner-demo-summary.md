# Koko Nails: bản demo local đã hoàn thành

Bản local đã hoàn thành để thử quy trình yêu cầu hẹn và nhân viên xử lý. Giao diện tiếng Đức dùng dữ liệu giả, không tạo lịch Treatwell hay gửi tin nhắn; tải lại trang sẽ xóa dữ liệu. Bộ chọn vai trò là mô phỏng công khai, không phải đăng nhập được bảo vệ.

Mở `http://127.0.0.1:4183`; nếu lab chưa chạy, dùng `npm run lab`:

1. Chọn Testkundin, dịch vụ và giờ rồi gửi yêu cầu. PENDING chưa giữ chỗ.
2. Chọn Testteam, mở yêu cầu, đối chiếu studio/giờ/resource với reference `DEMO-TEST001` và tích xác nhận đối chiếu. Giá trị không khớp sẽ bị từ chối.
3. Xác nhận hoặc từ chối yêu cầu; kết quả chỉ có hiệu lực trong test.
4. Muốn thử hủy/dời, chọn kịch bản thay đổi và xác nhận xóa dữ liệu. Quyền giả này chưa phải chính sách salon.

Đã kiểm tra đặt hẹn, bàn phím/focus, lỗi JavaScript và màn hình 320px với chữ 200%. [Báo cáo và ảnh](lab-usability-review.md) ghi rõ phạm vi.

Pilot thật cần xác minh danh tính/địa điểm, dịch vụ/thời lượng, resource/capacity, giờ/buffer và link/quy trình Treatwell. [Mẫu JSON duy nhất](../config/pilot.template.json) để 8 trường bắt buộc là `null`; app/build không đọc mẫu này.

`node scripts/check-pilot-template.mjs` trả `ready: false`, exit code `1`. Nội dung đã điền vẫn chờ xác minh; công cụ không xác nhận dữ kiện thật hoặc bật pilot.

Auth/database, quyền nhân viên, dữ liệu riêng và hosting còn trong [checklist pilot](pilot-setup-checklist.md). Chưa có thông tin salon/link đã xác minh; không lấy dữ liệu tiệm trùng tên. Parent sẽ tổng hợp phần thiếu. Bản local dừng tại checkpoint này; PR giữ draft, hosting pending.
