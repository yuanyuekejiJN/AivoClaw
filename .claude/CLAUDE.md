# 全局配置规则（所有项目生效）

## 1. 语言要求
- 所有回答、解释、代码注释必须使用**简体中文**。
- 专业术语首次出现时，需附带中文释义。

## 2. 代码注释规则
- 单行注释：使用 `// 中文说明`，放在代码上方，而非行尾。
- 多行注释：使用 `/* 中文说明 */`，用于复杂逻辑块。
- 函数/方法：必须使用 JSDoc 风格注释，包含功能、参数、返回值。
- 示例：
  ```javascript
  /**
   * 计算两数之和
   * @param {number} a - 第一个加数
   * @param {number} b - 第二个加数
   * @returns {number} 两数之和
   */
  function add(a, b) {
    return a + b;
  }


electron/controller/ -- 实际的源文件目录（不会被清理）  代码不要再这里面
public/electron/controller/ -- 构建产物目录（会从 electron/ 复制过来，会被清理）