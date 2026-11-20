const CONCEPT_NOTES = new Map([
  [4, "Kiến thức cần nhớ: π là hằng số xấp xỉ 3,14. Chu vi hình tròn C = 2πr; diện tích S = πr². Dùng đúng giá trị π và cách làm tròn đề bài yêu cầu."],
  [16, "Kiến thức cần nhớ: Năm nhuận là năm chia hết cho 400, hoặc chia hết cho 4 nhưng không chia hết cho 100."],
  [20, "Kiến thức cần nhớ: Ba cạnh tạo thành tam giác khi tổng độ dài của từng cặp cạnh lớn hơn cạnh còn lại. Cần kiểm tra cả điều kiện độ dài dương."],
  [21, "Kiến thức cần nhớ: Tam giác đều có ba cạnh bằng nhau; tam giác cân có ít nhất hai cạnh bằng nhau; tam giác thường có ba cạnh khác nhau. Kiểm tra tính hợp lệ trước khi phân loại."],
  [22, "Kiến thức cần nhớ: Tam giác vuông thỏa mãn định lý Pythagore: bình phương cạnh lớn nhất bằng tổng bình phương hai cạnh còn lại. Ba cạnh cũng phải tạo thành tam giác hợp lệ."],
  [24, "Kiến thức cần nhớ: Với ax + b = 0, nếu a khác 0 thì x = -b/a. Nếu a = 0, phương trình có vô số nghiệm khi b = 0 và vô nghiệm khi b khác 0."],
  [30, "Kiến thức cần nhớ: Với ax² + bx + c = 0 và a khác 0, biệt thức Δ = b² - 4ac. Δ > 0 có hai nghiệm thực, Δ = 0 có nghiệm kép, Δ < 0 không có nghiệm thực."],
  [34, "Kiến thức cần nhớ: N! = 1 × 2 × ... × N; theo quy ước, 0! = 1. Hãy chú ý giới hạn kiểu dữ liệu để tránh tràn số."],
  [39, "Kiến thức cần nhớ: Số đối xứng có các chữ số đọc từ trái sang phải giống khi đọc từ phải sang trái. Ví dụ: 1221 và 7."],
  [40, "Kiến thức cần nhớ: GCD (ƯCLN) là ước dương lớn nhất cùng chia hết hai số. Bài này quy ước gcd(0,0) = 0."],
  [41, "Kiến thức cần nhớ: LCM (BCNN) là bội dương nhỏ nhất cùng chia hết cho hai số. Nếu một trong hai số bằng 0 thì theo đề, kết quả bằng 0."],
  [47, "Kiến thức cần nhớ: Dãy Fibonacci được xác định bởi F₀ = 0, F₁ = 1 và Fₙ = Fₙ₋₁ + Fₙ₋₂ với n ≥ 2."],
  [48, "Kiến thức cần nhớ: Số nguyên tố là số nguyên lớn hơn 1 chỉ có đúng hai ước dương: 1 và chính nó. Vì vậy 0, 1 và số âm không phải số nguyên tố."],
  [49, "Kiến thức cần nhớ: Khi đếm số nguyên tố trong [1, N], chỉ xét số nguyên lớn hơn 1; các số 0 và 1 không phải số nguyên tố."],
  [50, "Kiến thức cần nhớ: Ước dương của n là số nguyên dương chia n không dư. Chỉ đếm mỗi ước một lần."],
  [51, "Kiến thức cần nhớ: Ước thực sự của n là các ước dương nhỏ hơn n; không tính chính n."],
  [52, "Kiến thức cần nhớ: Số hoàn hảo là số nguyên dương bằng tổng các ước dương thực sự của nó. Ví dụ: 6 = 1 + 2 + 3."],
  [53, "Kiến thức cần nhớ: Số chữ số 0 tận cùng của N! được tính bằng tổng floor(N/5) + floor(N/25) + floor(N/125) + ...; không cần tính trực tiếp N!."],
  [59, "Kiến thức cần nhớ: Số Armstrong có k chữ số nếu bằng tổng từng chữ số lũy thừa k. Ví dụ: 153 = 1³ + 5³ + 3³."],
  [60, "Kiến thức cần nhớ: Phân tích thừa số nguyên tố có tính cả số lần lặp. Ví dụ: 12 = 2 × 2 × 3 có 3 thừa số nguyên tố."],
  [61, "Kiến thức cần nhớ: Thừa số nguyên tố lớn nhất là thừa số lớn nhất trong phân tích n thành tích các số nguyên tố; các thừa số lặp vẫn thuộc phân tích."],
  [63, "Kiến thức cần nhớ: Quy tắc Collatz: n chẵn thì chia 2; n lẻ thì đổi thành 3n + 1. Đếm số lần biến đổi cho đến khi đạt 1, không tính giá trị ban đầu là một bước."],
  [79, "Kiến thức cần nhớ: Số đối xứng là số có biểu diễn thập phân đọc xuôi và đọc ngược như nhau. Số 0 cũng là số đối xứng."],
  [80, "Kiến thức cần nhớ: Số Armstrong có k chữ số nếu bằng tổng từng chữ số lũy thừa k. Cần dùng số chữ số của từng số đang xét."],
  [86, "Kiến thức cần nhớ: Số Harshad (Niven) là số nguyên dương chia hết cho tổng các chữ số của chính nó."],
  [88, "Kiến thức cần nhớ: Hai số nguyên tố cùng nhau khi ƯCLN của chúng bằng 1. Không yêu cầu từng số riêng lẻ phải là số nguyên tố."],
  [90, "Kiến thức cần nhớ: Một số nguyên dương có đúng 3 ước dương khi và chỉ khi nó là bình phương của một số nguyên tố."],
  [94, "Kiến thức cần nhớ: Số nguyên tố phải lớn hơn 1; số đối xứng có biểu diễn thập phân đọc xuôi và đọc ngược như nhau. Một số phải thỏa mãn đồng thời cả hai điều kiện."],
  [95, "Kiến thức cần nhớ: Số chính phương là bình phương của một số nguyên không âm, chẳng hạn 0, 1, 4, 9, 16. Khi kiểm tra, tránh sai số do căn bậc hai thực."],
  [110, "Kiến thức cần nhớ: Trước hết kiểm tra số nguyên tố; sau đó tính tổng chữ số và kiểm tra tổng đó chẵn. Hai điều kiện phải cùng đúng."],
  [111, "Kiến thức cần nhớ: Số đối xứng là số có biểu diễn thập phân đọc xuôi và đọc ngược như nhau."],
  [115, "Kiến thức cần nhớ: Chỉ đếm các ước của N mà bản thân chúng là số nguyên tố. Mỗi giá trị nguyên tố chỉ tính một lần."],
  [116, "Kiến thức cần nhớ: Đếm các ước dương của N đồng thời là số chính phương; ước chính phương có dạng k² với k là số nguyên không âm."],
  [118, "Kiến thức cần nhớ: Hai số nguyên tố cùng nhau khi gcd(a,b) = 1. Điều kiện a < b nghĩa là mỗi cặp không phân biệt thứ tự và không ghép một số với chính nó."],
  [128, "Kiến thức cần nhớ: Số nguyên dương có đúng 3 ước dương khi và chỉ khi nó là bình phương của một số nguyên tố."],
  [129, "Kiến thức cần nhớ: Công thức Leibniz: π = 4(1 - 1/3 + 1/5 - 1/7 + ...). Dùng đúng N số hạng đầu và chú ý phép chia phải thực hiện trên kiểu số thực."],
]);

const RESULT_LABELS = {
  2: ["Hieu = ", "Tich = "],
  3: ["Chu vi = ", "Dien tich = "],
  4: ["Chu vi C = ", "Dien tich S = "],
  6: ["Thoi gian (HH:MM:SS) = "],
};
const SINGLE_RESULT_LABELS = {
  44: "Kiem tra day tang nghiem ngat: ",
  45: "Phan loai day: ",
  1: "Tong cua a va b = ",
  5: "Trung binh cong ba so = ",
  7: "Thu tu sau khi hoan doi = ",
  8: "Thuong va so du = ",
  9: "Thanh tien = ",
  10: "Gia sau khi giam = ",
  11: "Tinh chan le: ",
  12: "Phan loai dau so: ",
  13: "So lon hon = ",
  14: "Gia tri lon nhat = ",
  15: "Gia tri nho nhat = ",
  16: "Ket luan ve nam: ",
  17: "Kiem tra chia het ca 3 va 5: ",
  18: "Kiem tra chia het cho 3 hoac 5: ",
  19: "Quan he giua a va b: ",
  20: "Ket qua kiem tra tam giac: ",
  21: "Loai tam giac: ",
  22: "Ket qua kiem tra tam giac vuong: ",
  23: "Xep loai diem: ",
  24: "Nghiem cua phuong trinh: ",
  25: "Tien dien can thanh toan = ",
  26: "Gia ve theo do tuoi = ",
  27: "Cuoc van chuyen = ",
  28: "Vi tri diem: ",
  29: "Ket qua so sanh khoang cach: ",
  30: "Phan loai phuong trinh: ",
  31: "Tong day so tu 1 den N = ",
  32: "Tong cac so chan = ",
  33: "Tong cac so le = ",
  34: "Gia tri giai thua N! = ",
  35: "Gia tri a mu b = ",
  36: "So chu so cua n = ",
  37: "Tong cac chu so = ",
  38: "So sau khi dao chu so = ",
  39: "Kiem tra doi xung: ",
  40: "Uoc chung lon nhat = ",
  41: "Boi chung nho nhat = ",
  42: "So luong boi cua K = ",
  43: "Tong cac boi cua K = ",
  44: "",
  45: "",
  46: "Tong dieu hoa = ",
  47: "So Fibonacci thu N = ",
  48: "Kiem tra so nguyen to: ",
  49: "So luong so nguyen to = ",
  50: "So uoc duong = ",
  51: "Tong cac uoc thuc su = ",
  52: "Kiem tra so hoan hao: ",
  53: "So chu so 0 o cuoi N! = ",
  54: "So lan chu so d xuat hien = ",
  55: "Chu so lon nhat = ",
  56: "Chu so nho nhat = ",
  57: "Tich cac chu so = ",
  58: "Chu so rut gon = ",
  59: "Kiem tra so Armstrong: ",
  60: "So thua so nguyen to (tinh ca lap) = ",
  61: "Thua so nguyen to lon nhat = ",
  62: "Uoc duong nho nhat lon hon 1 = ",
  63: "So buoc de day Collatz ve 1 = ",
  64: "Tong luan phien den N = ",
  65: "Bang nhan cua N:\n",
  66: "Bang tich N x N:\n",
  67: "Hinh chu nhat dac:\n",
  68: "Tam giac sao tang dan:\n",
  69: "Tam giac sao giam dan:\n",
  70: "Tam giac so tang dan:\n",
  71: "Tam giac lap so theo hang:\n",
  72: "Kim tu thap sao:\n",
  73: "Kim tu thap sao nguoc:\n",
  74: "Khung chu nhat rong:\n",
  75: "Bang ky tu xen ke:\n",
  76: "Tong chu so cua day tu 1 den N = ",
  77: "So luong boi thoa dieu kien = ",
  78: "Tong cac so nguyen to trong doan = ",
  79: "So luong so doi xung = ",
  80: "So luong so Armstrong = ",
  81: "So luong so hoan hao = ",
  82: "So luong gia tri co tong chu so bang S = ",
  83: "So co tong chu so lon nhat = ",
  84: "So luong so co chu so tang nghiem ngat = ",
  85: "So luong so co chu so lien tiep trung nhau = ",
  86: "So luong so chia het cho tong chu so = ",
  87: "Tong cac gia tri gcd voi N = ",
  88: "So luong so nguyen to cung nhau voi N = ",
  89: "So cap co tong chia het cho K = ",
  90: "So luong so co dung ba uoc = ",
  91: "Tam giac vuong rong:\n",
  92: "Hinh thoi sao:\n",
  93: "Gia tri gan dung e mu x = ",
  94: "So luong so vua nguyen to vua doi xung = ",
  95: "So luong so chinh phuong = ",
  96: "So chu so chan = ",
  97: "So chu so le = ",
  98: "Tong cac chu so chan = ",
  99: "Tong cac chu so le = ",
  100: "So chu so 0 = ",
  101: "Chu so dau tien cua N = ",
  102: "Kiem tra tat ca chu so chan: ",
  103: "Kiem tra day chu so khong giam: ",
  104: "Kiem tra chan le xen ke: ",
  105: "So chu so lon hon D = ",
  106: "So luong so thoa dieu kien tong chu so = ",
  107: "Tong cac so thoa dieu kien tong chu so = ",
  108: "So luong boi cua A nhung khong cua B = ",
  109: "Tong cac so chia het cho 3 nhung khong cho 5 = ",
  110: "So nguyen to co tong chu so chan = ",
  111: "Tong cac so doi xung trong doan = ",
  112: "So nguyen to lon nhat trong doan = ",
  113: "So luong so co dung bon uoc = ",
  114: "So uoc cua N nam trong doan = ",
  115: "So uoc nguyen to phan biet = ",
  116: "So uoc chinh phuong = ",
  117: "So cap co thu tu thoa dieu kien = ",
  118: "So cap nguyen to cung nhau = ",
  119: "So cap co UCLN bang K = ",
  120: "So gia tri X co gcd(X, N) bang D = ",
  121: "So luong so co cac chu so khong lap = ",
  122: "So luong so co it nhat mot chu so 0 = ",
  123: "So luong so co dung K chu so le = ",
  124: "So luong so co tong chu so nguyen to = ",
  125: "Tong cac so co tong chu so nguyen to = ",
  126: "So doi xung nho nhat tu N tro di = ",
  127: "So nguyen to nho nhat tu N tro di = ",
  128: "So nho nhat co dung ba uoc tu N tro di = ",
  129: "Gia tri Pi xap xi theo N so hang = ",
  130: "Tong dieu hoa luan phien = ",
  131: "Tong nghich dao cac so le = ",
  132: "Tong nghich dao binh phuong = ",
  133: "Hinh vuong rong:\n",
  134: "Hai duong cheo tao hinh chu X:\n",
  135: "Dau cong bang dau sao:\n",
  136: "Kim tu thap rong:\n",
  137: "Dong ho cat bang dau sao:\n",
  138: "Hinh canh buom bang dau sao:\n",
  139: "Tam giac Floyd:\n",
  140: "Tam giac nhi phan:\n",
  141: "Bang so lap theo hang:\n",
  142: "Bang nhan N x M:\n",
  143: "Kim tu thap so doi xung:\n",
  144: "Kim tu thap so doi xung nguoc:\n",
  145: "Hinh thoi rong:\n",
  146: "Tam giac vuong rong can phai:\n",
  147: "Tam giac vuong nguoc rong:\n",
  148: "Ban co X va cham:\n",
  149: "Tam giac Pascal:\n",
  150: "Hinh binh hanh rong:\n",
};
// VI: Bài không ghi ký hiệu biến trong mô tả vẫn cần nhãn nhập rõ ràng.
// EN: Add an explicit input prompt when the statement names a value, not a variable.
const INPUT_LABELS = {
  26: ["Nhap tuoi = "],
  44: ["Nhap N = ", "Nhap cac so = "],
  45: ["Nhap N = ", "Nhap cac so = "],
};
const OUTPUT_RULES = new Map([
  [2, "In hiệu ở dòng thứ nhất và tích ở dòng thứ hai, mỗi kết quả có nhãn riêng."],
  [3, "In chu vi trước, diện tích sau; mỗi kết quả trên một dòng và có nhãn."],
  [4, "In chu vi C trước, diện tích S sau; mỗi kết quả trên một dòng, làm tròn đúng 2 chữ số sau dấu chấm (.), giữ số 0 tận cùng."],
  [5, "In trung bình cộng với đúng 2 chữ số sau dấu chấm (.), giữ số 0 tận cùng."],
  [6, "In thời gian theo đúng mẫu HH:MM:SS; giờ có thể lớn hơn 23."],
  [10, "In giá sau giảm với đúng 2 chữ số sau dấu chấm (.), giữ số 0 tận cùng."],
  [21, "Chỉ in đúng một nhãn phân loại theo đề bài."],
  [23, "Chỉ in một chữ cái xếp loại, không kèm lời giải thích."],
  [24, "In đúng trường hợp vô nghiệm/vô số nghiệm hoặc nghiệm với đúng 2 chữ số sau dấu chấm (.), giữ số 0 tận cùng. Nếu nghiệm bằng 0, in 0.00 không có dấu âm."],
  [28, "Chỉ in đúng một nhãn vị trí theo đề bài."],
  [30, "Chỉ in đúng một nhãn phân loại nghiệm theo đề bài."],
  [65, "In tiêu đề 'Bang nhan cua N:' trên một dòng, sau đó đủ 10 dòng theo mẫu N x i = kết_quả; mỗi phép nhân nằm trên một dòng."],
  [66, "In tiêu đề 'Bang tich N x N:' trên một dòng, sau đó đúng N hàng và N cột; các số cùng hàng cách nhau một dấu cách."],
  [67, "In tiêu đề 'Hinh chu nhat dac:' trên một dòng, rồi đúng n hàng, mỗi hàng m dấu * cách nhau một dấu cách."],
  [68, "In tiêu đề 'Tam giac sao tang dan:' trên một dòng, rồi in tam giác căn trái; hàng thứ i có đúng i dấu *."],
  [69, "In tiêu đề 'Tam giac sao giam dan:' trên một dòng, rồi giảm từ n dấu * xuống một dấu * theo từng hàng."],
  [70, "In tiêu đề 'Tam giac so tang dan:' trên một dòng, rồi in các số theo hàng, cách nhau đúng một dấu cách."],
  [71, "In tiêu đề 'Tam giac lap so theo hang:' trên một dòng; hàng i gồm i lần số i, cách nhau một dấu cách."],
  [72, "In tiêu đề 'Kim tu thap sao:' trên một dòng; hàng i có 2 × (n − i) dấu cách đầu dòng và 2 × i − 1 dấu *."],
  [73, "In tiêu đề 'Kim tu thap sao nguoc:' trên một dòng; mỗi hàng sau thụt vào hai dấu cách và giảm hai dấu *."],
  [74, "In tiêu đề 'Khung chu nhat rong:' trên một dòng, sau đó chỉ in viền; phần trong là dấu cách, không có dấu cách thừa cuối dòng."],
  [75, "In tiêu đề 'Bang ky tu xen ke:' trên một dòng; bắt đầu bằng # ở góc trên trái, rồi # và . thay phiên theo hàng và cột."],
  [91, "In tiêu đề 'Tam giac vuong rong:' trên một dòng, sau đó in ba cạnh theo đúng mẫu và giữ nguyên các khoảng trống bên trong."],
  [92, "In tiêu đề 'Hinh thoi sao:' trên một dòng, rồi in hình thoi đặc căn giữa với số dấu * tăng và giảm đối xứng."],
  [46, "In H với đúng 6 chữ số sau dấu chấm (.), giữ đủ các số 0 tận cùng."],
  [93, "In kết quả e^x với đúng 6 chữ số sau dấu chấm (.), giữ đủ các số 0 tận cùng."],
  [129, "In giá trị Pi xấp xỉ với đúng 6 chữ số sau dấu chấm (.), giữ đủ các số 0 tận cùng."],
  [130, "In S với đúng 6 chữ số sau dấu chấm (.), giữ đủ các số 0 tận cùng."],
  [131, "In S với đúng 6 chữ số sau dấu chấm (.), giữ đủ các số 0 tận cùng."],
  [132, "In S với đúng 6 chữ số sau dấu chấm (.), giữ đủ các số 0 tận cùng."],
  [133, "In tiêu đề 'Hinh vuong rong:' trên một dòng, sau đó chỉ in viền hình vuông; phần trong là khoảng trống theo mẫu."],
  [134, "In tiêu đề 'Hai duong cheo tao hinh chu X:' trên một dòng, rồi in hình X N × N đúng vị trí dấu *."],
  [135, "In tiêu đề 'Dau cong bang dau sao:' trên một dòng, rồi in dấu cộng đúng kích thước N × N."],
  [136, "In tiêu đề 'Kim tu thap rong:' trên một dòng, sau đó chỉ in hai cạnh và đáy; phần trong để trống."],
  [137, "In tiêu đề 'Dong ho cat bang dau sao:' trên một dòng, rồi in đủ hàng và đặt dấu * đối xứng."],
  [138, "In tiêu đề 'Hinh canh buom bang dau sao:' trên một dòng, sau đó in hai cánh đối xứng theo mẫu."],
  [139, "In tiêu đề 'Tam giac Floyd:' trên một dòng, rồi in tam giác; các số cùng hàng cách nhau đúng một dấu cách."],
  [140, "In tiêu đề 'Tam giac nhi phan:' trên một dòng, sau đó in N dòng 0 và 1 theo quy tắc bắt đầu từng hàng."],
  [141, "In tiêu đề 'Bang so lap theo hang:' trên một dòng, rồi in N hàng; hàng i gồm M lần số i, cách nhau một dấu cách."],
  [142, "In tiêu đề 'Bang nhan N x M:' trên một dòng, sau đó đúng N hàng và M cột; ô (i, j) bằng i × j."],
  [143, "In tiêu đề 'Kim tu thap so doi xung:' trên một dòng, rồi in kim tự tháp số cân giữa bằng dấu cách."],
  [144, "In tiêu đề 'Kim tu thap so doi xung nguoc:' trên một dòng, sau đó in các bậc giảm đúng thứ tự."],
  [145, "In tiêu đề 'Hinh thoi rong:' trên một dòng, rồi in viền hình thoi; phần trong để trống."],
  [146, "In tiêu đề 'Tam giac vuong rong can phai:' trên một dòng, sau đó in hai cạnh và cạnh đáy."],
  [147, "In tiêu đề 'Tam giac vuong nguoc rong:' trên một dòng, rồi in đủ số hàng theo mẫu."],
  [148, "In tiêu đề 'Ban co X va cham:' trên một dòng; bắt đầu bằng X ở góc trên trái, X và dấu chấm thay phiên."],
  [149, "In tiêu đề 'Tam giac Pascal:' trên một dòng, rồi in N hàng đầu căn trái; số cùng hàng cách nhau một dấu cách."],
  [150, "In tiêu đề 'Hinh binh hanh rong:' trên một dòng, sau đó in phần viền và độ lệch từng hàng theo mẫu."],
]);

function taskSample(task) {
  const firstTest = task.tests?.[0] || {};
  return {
    input: String(task.sample_input ?? firstTest.input ?? ""),
    output: String(task.sample_output ?? firstTest.output ?? ""),
  };
}

const NUMERIC_VALUE = "[+-]?(?:\\d+(?:[.,]\\d*)?|[.,]\\d+)(?:[eE][+-]?\\d+)?";
const VALUE_LINE = new RegExp(`^${NUMERIC_VALUE}(?:\\s+${NUMERIC_VALUE})*$`);

// VI: Dùng sample_output đầy đủ để suy ra nhãn cho mọi bài khi các giá trị
// trong mẫu khớp sample_input và output của test đầu; nhãn JS là phương án cũ.
// EN: Infer labels for any task when the full sample transcript matches sample
// input and the first test output; retain legacy labels as a fallback.
function sampleFormat(task) {
  const lines = String(task.sample_output ?? "").replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  const pattern = /^([\p{L}][^\n]*?[:=]\s*)(.*)$/u;
  const parts = lines.map((line) => {
    const match = pattern.exec(line);
    return match ? { label: match[1], value: match[2].trim() } : null;
  });
  if (!parts.length || parts.some((part) => !part)) return { prompts: [], lineLabels: null };

  const inputCandidates = [task.sample_input, task.tests?.[0]?.input]
    .map((value) => String(value ?? "").replace(/\r\n?/g, "\n").trim().split(/\s+/).filter(Boolean));
  for (let prefixCount = parts.length - 1; prefixCount >= 0; prefixCount--) {
    const prefix = parts.slice(0, prefixCount);
    const result = parts.slice(prefixCount);
    const echoedValues = prefix.flatMap((part) => part.value.split(/\s+/).filter(Boolean));
    if ((prefixCount === 0 || inputCandidates.some((inputValues) =>
      echoedValues.length === inputValues.length && echoedValues.every((value, index) => value === inputValues[index]))) &&
        result.length && result.every(Boolean)) {
      return {
        prompts: prefix.map((part) => part.label),
        lineLabels: result.map((part) => part.label),
      };
    }
  }
  return { prompts: [], lineLabels: null };
}

function taskPresentation(task, input = taskSample(task).input) {
  // VI: Ưu tiên nhãn chỉnh được từ mẫu; giữ map cũ cho bài chưa cập nhật mẫu.
  // EN: Prefer labels editable through the sample; preserve legacy fallback maps.
  const legacy = Number(task.id) >= 1 && Number(task.id) <= 150;
  const inferred = sampleFormat(task);
  const fieldNames = [];
  const inputDescription = String(task.input || "");
  const fieldPattern = /(^|[^\p{L}\p{N}])([A-Za-z])(?=$|[^\p{L}\p{N}])/gu;
  for (const match of inputDescription.matchAll(fieldPattern)) {
    const name = match[2];
    if (!fieldNames.includes(name)) fieldNames.push(name);
  }
  const inputCount = String(input || "").trim().split(/\s+/).filter(Boolean).length;
  const hasSampleLabels = inferred.prompts.length > 0 || inferred.lineLabels !== null;
  const prompts = hasSampleLabels ? inferred.prompts : INPUT_LABELS[task.id] || (legacy ? fieldNames.slice(0, inputCount).map((name) => `Nhap ${name} = `) : []);

  // Keep visible examples and strict output checking specific to each task.
  // The former title-based fallback made many unrelated tasks say the same thing.
  const resultLabel = hasSampleLabels && inferred.lineLabels.length === 1 ? inferred.lineLabels[0] : SINGLE_RESULT_LABELS[task.id] || (legacy ? "Ket qua: " : "");
  const lineLabels = hasSampleLabels ? inferred.lineLabels : RESULT_LABELS[task.id] || null;
  const formattedOutput = (rawOutput) => {
    const raw = String(rawOutput ?? "");
    const lines = raw.split("\n");
    if (prompts.length && lineLabels && lines.length === prompts.length + lineLabels.length &&
        prompts.every((prompt, index) => lines[index].startsWith(prompt)) &&
        lineLabels.every((label, index) => lines[prompts.length + index].startsWith(label)))
      return lines.slice(prompts.length).join("\n");
    if (legacy && lineLabels && lineLabels.length === lines.length)
      return lines.map((line, index) => lineLabels[index] + line).join("\n");
    const suffix = raw.endsWith("\n") ? "\n" : "";
    const values = (suffix ? raw.slice(0, -1) : raw).split("\n");
    if (lineLabels && lineLabels.length === values.length &&
        values.every((line, index) => line.startsWith(lineLabels[index]))) return raw;
    if (resultLabel && raw.startsWith(resultLabel)) return raw;
    if (lineLabels && lineLabels.length === values.length)
      return values.map((line, index) => lineLabels[index] + line).join("\n") + suffix;
    return resultLabel + raw;
  };
  // EN: The judge supplies stdin without terminal echo. Keep program stdout
  // faithful, then build a visible terminal transcript with echoed inputs.
  // VI: Test dùng stdin nên không tự echo; giữ stdout thật và ghép input vào
  // transcript hiển thị ngay sau từng prompt.
  const promptText = prompts.join("");
  const inputEchoValues = (inputValue) => {
    const normalizedInput = String(inputValue ?? "").replace(/\r/g, "").trim();
    const tokens = normalizedInput ? normalizedInput.split(/\s+/) : [];
    const lines = normalizedInput ? normalizedInput.split("\n") : [];
    if (prompts.length && prompts.length === tokens.length) return tokens;
    if (prompts.length && prompts.length === lines.length) return lines;
    return null;
  };
  const expectedProgramOutput = (rawOutput) => promptText + formattedOutput(rawOutput);
  const expected = (rawOutput, inputValue = input) => {
    const values = inputEchoValues(inputValue);
    if (!values) return expectedProgramOutput(rawOutput);
    return prompts.map((prompt, index) => `${prompt}${values[index]}\n`).join("") + formattedOutput(rawOutput);
  };
  const renderConsoleOutput = (rawOutput, inputValue = input) => {
    const values = inputEchoValues(inputValue);
    if (!values) return String(rawOutput ?? "");
    let cursor = 0;
    let transcript = "";
    for (let index = 0; index < prompts.length; index++) {
      const promptAt = String(rawOutput ?? "").indexOf(prompts[index], cursor);
      if (promptAt < 0) return String(rawOutput ?? "");
      transcript += String(rawOutput ?? "").slice(cursor, promptAt);
      transcript += `${prompts[index]}${values[index]}\n`;
      cursor = promptAt + prompts[index].length;
    }
    return transcript + String(rawOutput ?? "").slice(cursor);
  };
  return {
    prompts,
    promptText,
    resultLabel,
    lineLabels,
    expected,
    expectedProgramOutput,
    renderConsoleOutput,
    guide: !legacy ? [
      "In đúng các dòng, nhãn và thứ tự theo mục OUTPUT và màn hình mẫu.",
      "Chỉ ghi vào test output những gì chương trình tự in; dữ liệu nhập không tự xuất hiện trong stdout.",
    ].join("\n") : [
      "Mỗi lời nhắc nhập giữ trên cùng dòng với giá trị được nhập, đúng thứ tự sau:",
      ...(prompts.length ? prompts : ["Không có dữ liệu vào"]),
      "Test tự cấp dữ liệu và mô phỏng terminal hiện giá trị ngay sau lời nhắc. Không tự xuống dòng sau lời nhắc trước khi nhập.",
      "Mẫu phần kết quả:",
      ...(lineLabels || [resultLabel.trimEnd() || "Theo đúng từng dòng trong test output"]),
      OUTPUT_RULES.get(task.id) || "In đúng nhãn kết quả và thứ tự theo mẫu; không thêm lời giải thích hoặc nội dung thừa.",
    ].join("\n"),
  };
}

export { CONCEPT_NOTES, OUTPUT_RULES, taskPresentation, taskSample };
