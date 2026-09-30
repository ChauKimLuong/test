# Thiết kế UI/UX

Áp dụng skill **ui-ux-pro-max**, tham khảo design-system cho enterprise workflow và hướng dẫn Next.js/accessibility.

## Định hướng

- Tông navy, trắng, xanh dương; màu xanh lá, hổ phách, đỏ dùng cho trạng thái.
- Sidebar theo công việc và quản trị; nội dung chính có tiêu đề, mô tả ngắn và hành động chính.
- Bố cục có khoảng thở; bảng dữ liệu thay cho các khối trang trí lớn.
- Các dashboard tính từ dữ liệu được API cho phép truy cập.
- Icon Phosphor nhất quán, không phụ thuộc CDN/font mạng ngoài.
- Nhãn tiếng Việt, ngày giờ vi-VN, tiền hiển thị phân cách hàng nghìn.

## Thành phần và tương tác

- Button/inputs, status badge có chữ, table, pagination, search/filter, empty/loading/error state.
- Modal bằng native dialog: focus trap, Escape, trở về hành động trước.
- Focus outline, skip link, label cho input, aria-label cho nút icon.
- Trường bắt buộc có dấu *, lỗi hiển thị ngay dưới trường và kiểm tra lại ở server.
- Vô hiệu nút khi gửi; xác nhận trước thao tác quyết định/hủy/thay đổi trạng thái.
- Trình thiết kế hỗ trợ kéo và nút lên/xuống cho bàn phím, hoàn tác/làm lại.
- Nội dung dài được xuống dòng; giảm chuyển động khi prefers-reduced-motion.
- Bản nháp có lưu tạm theo tài khoản/phân công trên trình duyệt; nút Lưu bản nháp ghi database.
- Các mốc responsive: 1600, 1250, 1000, 760, 470px. Bảng có vùng cuộn riêng trên mobile.

## Biểu mẫu A4

Paper component dùng chung cho xem mẫu và hồ sơ đã điền. Header gồm tên doanh nghiệp, mã mẫu/mã đơn; thông tin người gửi; dữ liệu động; nhận xét; người đề nghị/người duyệt. CSS print chọn A4, lề 15 mm, tránh tách một trường qua trang khi có thể. Nội dung dài có thể chiếm nhiều trang; kiểm tra bản xem trước của trình duyệt trước khi lưu PDF.

Giao diện không giả lập chữ ký tay hay chữ ký số. Kết quả phê duyệt được thể hiện bằng người xử lý và thời điểm.

## Kiểm tra thủ công

1. Desktop: sidebar, bảng, dashboard, trình thiết kế không đè nội dung.
2. Mobile: mở/đóng menu, điền form không phóng to do input quá nhỏ, bảng chỉ cuộn trong vùng.
3. Tab/Shift+Tab; mở dialog và Escape; nút icon có tên.
4. Tạo mẫu có trường dài, lựa chọn và bắt buộc; kéo hoặc dùng nút sắp xếp; undo/redo.
5. Xem A4 và in: kiểm tra văn bản tiếng Việt, xuống dòng, dữ liệu nhiều trang.
6. Lỗi API/mất phiên có thông báo và đường quay lại.
