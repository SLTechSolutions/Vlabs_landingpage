---
title: "Chính sách quyền riêng tư"
meta_title: "Quyền riêng tư website VLABS | Dự thảo cần rà soát"
description: "Dự thảo cần chủ sở hữu rà soát về yêu cầu liên hệ, tùy chọn trình duyệt và thông tin tích hợp thanh toán cần xác nhận trên website VLABS."
draft: false
noindex: true
---

**Dự thảo thông báo website — CẦN CHỦ SỞ HỮU RÀ SOÁT.** Trang này mô tả luồng xử lý trên website, không phải chính sách quyền riêng tư hoàn chỉnh hay thỏa thuận xử lý dữ liệu cho cơ sở giáo dục sử dụng VLABS. Chủ sở hữu phải xác nhận pháp nhân chịu trách nhiệm, dịch vụ được triển khai, thời gian lưu trữ, cookie và yêu cầu áp dụng trước khi xem đây là chính sách chính thức.

**Tích hợp thanh toán phải được rà soát trước khi thu tiền.** Giao diện và máy chủ hiện mô tả các luồng thanh toán khác nhau. Phần dưới ghi nhận khác biệt này; thông báo không làm cho chức năng thanh toán trở nên hoàn chỉnh.

## Yêu cầu liên hệ và trao đổi tiếp

Biểu mẫu liên hệ yêu cầu họ tên, địa chỉ email, số điện thoại và nội dung. Biểu mẫu liên hệ lại yêu cầu họ tên và địa chỉ email. Chỉ cung cấp thông tin cần cho yêu cầu của bạn; không gửi mật khẩu, số thẻ thanh toán, hồ sơ học sinh hay tài liệu nhạy cảm.

Khi tích hợp được cấu hình, website gửi thông tin yêu cầu đến GoHighLevel (LeadConnector) để quản lý liên hệ và trao đổi tiếp. Nội dung liên hệ có thể được lưu cùng hồ sơ liên hệ. Yêu cầu liên hệ lại không tự cung cấp tài liệu tải xuống, xác nhận suất thử nghiệm hay tạo tài khoản học tập.

## Thông tin thanh toán cần rà soát

**Định hướng trên giao diện.** Giao diện thanh toán thu họ tên, địa chỉ email và gửi mã gói, kỳ tháng/năm cùng ngôn ngữ đến máy chủ website. Giao diện mô tả gói đăng ký PayPal cho tiếng Anh/USD và trả trước một lần qua SePay cho tiếng Việt/VND. Đây là các luồng dự kiến, không phải tích hợp thanh toán thực tế đã được xác minh.

**Luồng máy chủ hiện có.** Với cấu hình và dữ liệu yêu cầu phù hợp, mã phía máy chủ được viết để tạo trang thanh toán thẻ do Stripe cung cấp cho gói đăng ký định kỳ theo tháng hoặc năm bằng USD. Số tiền được xác định từ giá gói chuẩn ở phía máy chủ, không từ giá trình duyệt gửi lên. Luồng này yêu cầu tên gói, trong khi giao diện gửi mã gói và ngôn ngữ; định dạng phản hồi cũng khác nhau. Cần thống nhất các yêu cầu, phản hồi và thông tin công bố, rồi kiểm thử trước khi thu tiền.

Yêu cầu hợp lệ có thể gửi thông tin liên hệ đã cung cấp đến GoHighLevel để trao đổi tiếp về thanh toán khi tích hợp được cấu hình. Stripe nhận địa chỉ email và thông tin gói đăng ký, đồng thời thu thông tin thẻ trên trang của Stripe. Biểu mẫu liên hệ của website không thu số thẻ.

Website hiện chưa triển khai lưu đơn hàng bằng Supabase hoặc tự cấp tài khoản học tập VLABS. URL hay tham số truy vấn khi quay lại sau thanh toán không phải bằng chứng đã trả tiền; trạng thái phải được xác minh bằng thông tin đã xác thực từ nhà cung cấp.

## Tùy chọn trình duyệt và giá hiển thị

Khi trình duyệt cho phép, công tắc sáng/tối lưu lựa chọn trong bộ nhớ cục bộ cho lần truy cập sau. Tùy chọn giao diện này không được gửi đến nhà cung cấp thanh toán hoặc GoHighLevel. Có thể xóa dữ liệu website trong trình duyệt để bỏ lựa chọn. Khi chưa có lựa chọn đã lưu, website dùng cài đặt giao diện của thiết bị.

Ngôn ngữ và tiền tệ hiển thị đổi cùng nhau: tiếng Anh/USD hoặc tiếng Việt/VND. Lựa chọn thủ công được lưu cục bộ khi có thể và giữ trong liên kết bằng tham số `lang`. Nếu trình duyệt chặn lưu trữ và lần truy cập sau không có tham số này, lựa chọn có thể không được giữ. Khi chưa có lựa chọn thủ công, thông tin quốc gia do hạ tầng lưu trữ website cung cấp có thể chọn tiếng Việt/VND cho Việt Nam và tiếng Anh/USD cho các trường hợp khác. Website không xin quyền vị trí của trình duyệt hay tra cứu định vị từ dịch vụ bên ngoài. Khi không có JavaScript, trang được yêu cầu quyết định ngôn ngữ và tiền tệ hiển thị.

Giá tiếng Việt hiển thị theo tỷ lệ quy đổi kinh doanh cố định 1 USD = 26.000 VND, không phải tỷ giá trực tiếp. Hiển thị VND không có nghĩa luồng máy chủ hiện tại có thể xử lý thanh toán VND; luồng này được viết cho gói đăng ký bằng USD.

## Dịch vụ bên thứ ba và xác nhận của chủ sở hữu

GoHighLevel và Stripe được tham chiếu trong các luồng máy chủ hiện có; việc sử dụng phụ thuộc cấu hình triển khai. Xem [Chính sách quyền riêng tư của GoHighLevel](https://www.gohighlevel.com/privacy-policy) và [Chính sách quyền riêng tư của Stripe](https://stripe.com/privacy) để tìm hiểu thông tin của từng dịch vụ.

PayPal, SePay và Supabase là dịch vụ dự kiến hoặc được giao diện nhắc đến, không phải tích hợp đã được xác minh trên website hiện tại. Các liên kết được giữ để rà soát: [Chính sách quyền riêng tư của PayPal](https://www.paypal.com/legalhub/privacy-full), [Chính sách quyền riêng tư của SePay](https://sepay.vn/privacy.html) và [Chính sách quyền riêng tư của Supabase](https://supabase.com/privacy).

Chủ sở hữu phải xác nhận nhật ký hạ tầng, phân tích, cookie, bên xử lý, thời gian lưu trữ và địa điểm xử lý thực tế của website đã triển khai. Trang bên thứ ba được liên kết có thể áp dụng cookie và chính sách riêng. Dự thảo không xác lập thời gian lưu trữ, phạm vi tài phán hay chứng nhận bảo mật cụ thể.

## Câu hỏi và yêu cầu về quyền riêng tư

Gửi email đến [info.vlabs@learningsmart.io.vn](mailto:info.vlabs@learningsmart.io.vn) để hỏi về thông tin liên hệ, yêu cầu sửa hoặc xóa, hay trao đổi yêu cầu của cơ sở giáo dục. Cung cấp đủ bối cảnh để nhận diện yêu cầu, không gửi hồ sơ nhạy cảm.

Trước khi sử dụng một triển khai VLABS trong tương lai với học sinh hoặc nhân viên, cần yêu cầu thông tin quyền riêng tư sản phẩm, quy tắc truy cập và điều khoản xử lý dữ liệu áp dụng. Đề án phát triển không thay thế những tài liệu này.
