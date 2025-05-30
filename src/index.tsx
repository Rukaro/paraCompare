import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { bitable, FieldType } from '@lark-base-open/js-sdk';

interface ParameterInfo {
  fieldName: string;
  fieldId: string;
  parameters: number[];
  order: number;
}

interface TextCell {
  type: 'text';
  text: string;
}

interface FieldMeta {
  id: string;
  name: string;
}

interface RecordComparison {
  recordId: string;
  recordName: string;
  differences: {
    fieldName: string;
    parameters: number[];
  }[];
}

interface FieldOption {
  id: string;
  name: string;
  selected: boolean;
}

// 参数编辑弹窗组件
interface ParameterEditModalProps {
  record: RecordComparison;
  onClose: () => void;
  onSave: (recordId: string, replacements: Record<string, Record<number, number>>) => void;
}

const ParameterEditModal: React.FC<ParameterEditModalProps> = ({ record, onClose, onSave }) => {
  const [parameterGroups, setParameterGroups] = useState<Record<string, string[]>>({});
  // 使用字符串类型存储输入值，允许空值
  const [groupReplacements, setGroupReplacements] = useState<Record<string, Record<number, string>>>({});
  const [isValid, setIsValid] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [autoFixed, setAutoFixed] = useState(false);

  // 初始化参数分组和替换值
  useEffect(() => {
    // 按参数列表分组字段
    const groups: Record<string, string[]> = {};
    
    record.differences.forEach(diff => {
      // 将参数列表转换为字符串作为键
      const paramKey = diff.parameters.sort((a, b) => a - b).join(',');
      
      if (!groups[paramKey]) {
        groups[paramKey] = [];
      }
      
      groups[paramKey].push(diff.fieldName);
    });

    setParameterGroups(groups);

    // 初始化替换值
    const initialReplacements: Record<string, Record<number, string>> = {};
    Object.keys(groups).forEach(paramKey => {
      initialReplacements[paramKey] = {};
      const params = paramKey.split(',').map(Number);
      params.forEach(param => {
        initialReplacements[paramKey][param] = param.toString(); // 默认不替换，使用字符串类型
      });
    });
    setGroupReplacements(initialReplacements);
  }, [record]);

  // 检测并修复循环替换
  const detectAndFixCircularReplacements = (replacements: Record<string, Record<number, string>>) => {
    let hasCircular = false;
    const fixedReplacements = { ...replacements };
    
    // 检查每个参数组
    Object.entries(fixedReplacements).forEach(([paramKey, paramReplacements]) => {
      // 创建替换映射
      const replacementMap = new Map<number, number>();
      Object.entries(paramReplacements).forEach(([original, replaced]) => {
        // 只处理有效的数字替换
        if (replaced !== '' && !isNaN(Number(replaced))) {
          replacementMap.set(Number(original), Number(replaced));
        }
      });
      
      // 检测循环
      const visited = new Set<number>();
      const stack = new Set<number>();
      
      const hasCycle = (start: number): boolean => {
        if (stack.has(start)) return true;
        if (visited.has(start)) return false;
        
        visited.add(start);
        stack.add(start);
        
        const next = replacementMap.get(start);
        if (next !== undefined && next !== start) {
          if (hasCycle(next)) return true;
        }
        
        stack.delete(start);
        return false;
      };
      
      // 检查每个参数是否有循环
      for (const [original, replaced] of replacementMap.entries()) {
        if (original !== replaced && hasCycle(original)) {
          hasCircular = true;
          break;
        }
      }
      
      // 如果检测到循环，修复它
      if (hasCircular) {
        // 使用临时变量存储所有替换
        const tempReplacements = new Map<number, number>();
        
        // 收集所有替换
        Object.entries(paramReplacements).forEach(([original, replaced]) => {
          const orig = Number(original);
          const repl = Number(replaced);
          if (replaced !== '' && !isNaN(repl) && orig !== repl) {
            tempReplacements.set(orig, repl);
          }
        });
        
        // 创建替换链
        const chains: number[][] = [];
        const processed = new Set<number>();
        
        for (const [original, replaced] of tempReplacements.entries()) {
          if (processed.has(original)) continue;
          
          const chain: number[] = [original];
          let current = replaced;
          
          while (tempReplacements.has(current) && !processed.has(current)) {
            chain.push(current);
            current = tempReplacements.get(current)!;
          }
          
          if (chain.length > 0) {
            chains.push(chain);
            chain.forEach(n => processed.add(n));
          }
        }
        
        // 修复循环
        chains.forEach(chain => {
          if (chain.length > 1) {
            // 将循环替换为直接替换到最终值
            const finalValue = chain[chain.length - 1];
            chain.slice(0, -1).forEach(value => {
              fixedReplacements[paramKey][value] = finalValue.toString();
            });
          }
        });
      }
    });
    
    return { hasCircular, fixedReplacements };
  };

  // 验证替换是否有效
  useEffect(() => {
    // 检查是否有循环替换（例如 1->2 和 2->1）
    const { hasCircular, fixedReplacements } = detectAndFixCircularReplacements(groupReplacements);
    
    if (hasCircular) {
      setAutoFixed(true);
      setGroupReplacements(fixedReplacements);
      setErrorMessage('检测到循环替换，已自动修复。');
    } else {
      setAutoFixed(false);
      setErrorMessage('');
    }
    
    setIsValid(true); // 现在总是有效的，因为我们自动修复了循环
  }, [groupReplacements]);

  const handleReplacementChange = (paramKey: string, originalParam: number, newValue: string) => {
    const newReplacements = { ...groupReplacements };
    newReplacements[paramKey] = { ...newReplacements[paramKey] };
    
    // 允许用户自由输入，包括空值
    newReplacements[paramKey][originalParam] = newValue;
    
    setGroupReplacements(newReplacements);
  };

  const handleSave = () => {
    // 验证所有输入是否合法
    let isValid = true;
    let errorMsg = '';
    
    // 检查每个参数组
    for (const [paramKey, paramReplacements] of Object.entries(groupReplacements)) {
      for (const [originalParam, newValue] of Object.entries(paramReplacements)) {
        // 检查是否为空或非数字
        if (newValue === '' || isNaN(Number(newValue))) {
          isValid = false;
          errorMsg = '参数值不能为空且必须是数字';
          break;
        }
      }
      if (!isValid) break;
    }
    
    if (!isValid) {
      setErrorMessage(errorMsg);
      return;
    }
    
    // 将组替换转换为字段替换
    const fieldReplacements: Record<string, Record<number, number>> = {};
    
    Object.entries(parameterGroups).forEach(([paramKey, fields]) => {
      fields.forEach(fieldName => {
        // 确保所有值都是数字
        const numericReplacements: Record<number, number> = {};
        Object.entries(groupReplacements[paramKey]).forEach(([key, value]) => {
          numericReplacements[Number(key)] = Number(value);
        });
        fieldReplacements[fieldName] = numericReplacements;
      });
    });
    
    onSave(record.recordId, fieldReplacements);
    onClose();
  };

  // 检查参数数量是否一致
  const hasConsistentParameterCount = () => {
    if (record.differences.length <= 1) return true;
    
    const firstParamCount = record.differences[0].parameters.length;
    return record.differences.every(diff => diff.parameters.length === firstParamCount);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 10000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        width: '80%',
        maxWidth: '800px',
        maxHeight: '80vh',
        overflow: 'auto',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        padding: '20px'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          borderBottom: '1px solid #eaeaea',
          paddingBottom: '15px'
        }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 500 }}>编辑参数 - {record.recordName}</h3>
          <button 
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: '#666'
            }}
          >
            ×
          </button>
        </div>
        
        {!hasConsistentParameterCount() ? (
          <div style={{ color: '#d32f2f', marginBottom: '20px' }}>
            参数数量不一致，无法编辑。请确保所有字段的参数数量相同。
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '20px' }}>
              <p style={{ margin: '0 0 10px 0', color: '#666' }}>
                为每个参数组指定新的值。修改一个参数组中的参数值将应用于该组中的所有字段。
              </p>
              {errorMessage && (
                <div style={{ 
                  color: autoFixed ? '#4CAF50' : '#d32f2f', 
                  marginBottom: '10px',
                  padding: '10px',
                  backgroundColor: autoFixed ? '#E8F5E9' : '#FFEBEE',
                  borderRadius: '4px',
                  border: `1px solid ${autoFixed ? '#A5D6A7' : '#FFCDD2'}`
                }}>
                  {errorMessage}
                </div>
              )}
            </div>
            
            {Object.entries(parameterGroups).map(([paramKey, fields]) => (
              <div key={paramKey} style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>参数组: [{paramKey}]</h4>
                <div style={{ marginBottom: '15px' }}>
                  <p style={{ margin: '0 0 5px 0', fontSize: '14px', color: '#666' }}>
                    包含以下字段:
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {fields.map(fieldName => (
                      <span key={fieldName} style={{ 
                        backgroundColor: '#e3f2fd', 
                        color: '#1976d2', 
                        padding: '4px 8px', 
                        borderRadius: '4px',
                        fontSize: '13px',
                        fontWeight: 500
                      }}>
                        {fieldName}
                      </span>
                    ))}
                  </div>
                </div>
                
                <div style={{ marginTop: '15px' }}>
                  <p style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#666' }}>
                    参数替换:
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {paramKey.split(',').map(param => (
                      <div key={param} style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ width: '120px', fontWeight: 500 }}>参数 {param}:</span>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <span style={{ marginRight: '5px', color: '#666' }}>{param} →</span>
                          <input
                            type="text"
                            value={groupReplacements[paramKey]?.[Number(param)] || Number(param)}
                            onChange={(e) => handleReplacementChange(paramKey, Number(param), e.target.value)}
                            style={{
                              padding: '8px 10px',
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                              width: '60px',
                              fontSize: '14px'
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={onClose}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f1f3f4',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                取消
              </button>
              <button
                onClick={handleSave}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#1a73e8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                保存
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// 添加飘字提示组件
const FloatingMessage: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => {
  const [isFading, setIsFading] = useState(false);
  
  useEffect(() => {
    // 1秒后开始渐隐
    const fadeTimer = setTimeout(() => {
      setIsFading(true);
      
      // 0.5秒后完全消失
      const hideTimer = setTimeout(() => {
        onClose();
      }, 500);
      
      return () => clearTimeout(hideTimer);
    }, 1000);
    
    return () => clearTimeout(fadeTimer);
  }, [onClose]);
  
  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        zIndex: 9999,
        color: 'white',
        fontSize: '24px',
        fontWeight: 'bold',
        textAlign: 'center',
        padding: '20px',
        cursor: 'pointer',
        transition: 'opacity 0.5s ease',
        opacity: isFading ? 0 : 1
      }}
      onClick={onClose}
    >
      {message}
    </div>
  );
};

// 添加绿框飘字提示组件
const GreenToast: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => {
  const [isFading, setIsFading] = useState(false);
  
  useEffect(() => {
    // 1秒后开始渐隐
    const fadeTimer = setTimeout(() => {
      setIsFading(true);
      
      // 0.5秒后完全消失
      const hideTimer = setTimeout(() => {
        onClose();
      }, 500);
      
      return () => clearTimeout(hideTimer);
    }, 1000);
    
    return () => clearTimeout(fadeTimer);
  }, [onClose]);
  
  return (
    <div 
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        backgroundColor: 'rgba(76, 175, 80, 0.9)',
        color: 'white',
        padding: '12px 24px',
        borderRadius: '4px',
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
        zIndex: 9999,
        fontSize: '16px',
        fontWeight: 'bold',
        textAlign: 'center',
        transition: 'opacity 0.5s ease',
        opacity: isFading ? 0 : 1
      }}
    >
      {message}
    </div>
  );
};

const App: React.FC = () => {
  const [comparisons, setComparisons] = useState<RecordComparison[]>([]);
  const [isComparing, setIsComparing] = useState(false);
  const [fieldOptions, setFieldOptions] = useState<FieldOption[]>([]);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [floatingMessage, setFloatingMessage] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<RecordComparison | null>(null);

  const extractParametersFromRecord = async (record: any, fields: any[], fieldMetaList: any[]): Promise<ParameterInfo[]> => {
    const paramInfo: ParameterInfo[] = [];
    
    for (const field of fields) {
      const cellValue = record.fields[field.id];
      
      if (Array.isArray(cellValue) && cellValue.length > 0) {
        const cell = cellValue[0] as TextCell;
        if (cell.type === 'text' && typeof cell.text === 'string') {
          const matches = cell.text.match(/\{(\d+)\}/g);
          if (matches) {
            const numbers = matches.map(match => 
              parseInt(match.replace(/[{}]/g, ''))
            ).sort((a, b) => a - b); // 排序以便比较
            
            const fieldMeta = fieldMetaList.find((f: FieldMeta) => f.id === field.id);
            const order = fieldMeta ? fieldMetaList.indexOf(fieldMeta) : Number.MAX_SAFE_INTEGER;
            
            paramInfo.push({
              fieldName: fieldMeta ? fieldMeta.name : field.id,
              fieldId: field.id,
              parameters: numbers,
              order: order
            });
          }
        }
      }
    }
    
    return paramInfo.sort((a, b) => a.order - b.order);
  };

  const compareAllRecords = async () => {
    try {
      setIsComparing(true);
      setFloatingMessage('开始比较所有记录...');
      
      const table = await bitable.base.getActiveTable();
      const view = await table.getActiveView();
      const fields = await table.getFieldList(); // 获取所有字段，不限制类型
      const fieldMetaList = await view.getFieldMetaList();
      
      // 获取所有记录（处理分页）
      let allRecords: any[] = [];
      let pageToken: string | undefined;
      let totalRecords = 0;
      
      do {
        const recordsResponse = await table.getRecords({
          pageSize: 1000, // 每页获取1000条记录
          pageToken: pageToken
        });
        
        allRecords = allRecords.concat(recordsResponse.records);
        totalRecords += recordsResponse.records.length;
        pageToken = recordsResponse.pageToken;
        
        setFloatingMessage(`正在获取记录...\n已获取 ${totalRecords} 条记录`);
      } while (pageToken);
      
      setFloatingMessage(`总共获取到 ${allRecords.length} 条记录\n开始比较参数...`);
      
      if (allRecords.length === 0) {
        setFloatingMessage('没有记录可比较');
        return;
      }
      
      const comparisons: RecordComparison[] = [];
      let processedRecords = 0;
      
      // 对每条记录进行内部参数比较
      for (const record of allRecords) {
        processedRecords++;
        if (processedRecords % 10 === 0) {
          setFloatingMessage(`正在比较记录...\n已处理 ${processedRecords}/${allRecords.length} 条记录`);
        }
        
        const params = await extractParametersFromRecord(record, fields, fieldMetaList);
        
        // 如果参数数量少于2，则跳过比较
        if (params.length < 2) {
          continue;
        }
        
        // 使用第一个参数作为基准
        const baseParams = params[0].parameters;
        const differences: { fieldName: string; expected: number[]; actual: number[] }[] = [];
        
        // 比较其他参数与基准参数
        for (let i = 1; i < params.length; i++) {
          // 只比较选中的字段
          if (!selectedFields.includes(params[i].fieldId)) {
            continue;
          }
          
          const currentParams = params[i].parameters;
          
          // 比较两个数组是否相等（忽略顺序）
          const sortedBaseParams = [...baseParams].sort((a, b) => a - b);
          const sortedCurrentParams = [...currentParams].sort((a, b) => a - b);
          
          if (JSON.stringify(sortedBaseParams) !== JSON.stringify(sortedCurrentParams)) {
            differences.push({
              fieldName: params[i].fieldName,
              expected: baseParams,
              actual: currentParams
            });
          }
        }
        
        // 如果有差异，则添加到比较结果中
        if (differences.length > 0) {
          // 获取索引列
          const indexFieldMeta = fieldMetaList[0]; // 第一个字段是索引列
          let recordName = `记录 ${record.recordId}`;
          
          // 从索引列获取记录名称
          const indexFieldValue = record.fields[indexFieldMeta.id];
          if (Array.isArray(indexFieldValue) && indexFieldValue.length > 0) {
            const cell = indexFieldValue[0] as TextCell;
            if (cell.type === 'text' && cell.text) {
              recordName = cell.text;
            }
          }
          
          // 添加所有字段的参数到比较结果中
          const allFieldParams = params
            .filter(param => selectedFields.includes(param.fieldId))
            .map(param => ({
              fieldName: param.fieldName,
              parameters: param.parameters
            }));
          
          comparisons.push({
            recordId: record.recordId,
            recordName: recordName,
            differences: allFieldParams
          });
        }
      }
      
      setComparisons(comparisons);
      setFloatingMessage(`比较完成！\n发现 ${comparisons.length} 条不一致的记录`);
    } catch (error) {
      console.error('Error comparing records:', error);
      setFloatingMessage(`比较出错: ${(error as Error).message}`);
    } finally {
      setIsComparing(false);
    }
  };

  // 添加复制记录内容的函数
  const copyRecordContent = async (comparison: RecordComparison) => {
    try {
      const table = await bitable.base.getActiveTable();
      const view = await table.getActiveView();
      const fieldMetaList = await view.getFieldMetaList();
      
      // 获取索引列
      const indexFieldMeta = fieldMetaList[0]; // 第一个字段是索引列
      
      // 获取记录
      const record = await table.getRecordById(comparison.recordId);
      
      // 获取索引列的值
      let indexFieldValue = '';
      const indexFieldCell = record.fields[indexFieldMeta.id];
      if (Array.isArray(indexFieldCell) && indexFieldCell.length > 0) {
        const cell = indexFieldCell[0] as TextCell;
        if (cell.type === 'text' && cell.text) {
          indexFieldValue = cell.text;
        }
      }
      
      // 只复制索引字段的内容
      const textToCopy = indexFieldValue;
      
      // 使用临时文本区域元素进行复制
      const textArea = document.createElement('textarea');
      textArea.value = textToCopy;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.top = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        const successful = document.execCommand('copy');
        if (successful) {
          setToastMessage(`已复制索引字段内容: ${indexFieldValue}`);
        } else {
          setToastMessage('复制失败: 无法执行复制命令');
        }
      } catch (err) {
        setToastMessage(`复制错误: ${(err as Error).message}`);
      }
      
      document.body.removeChild(textArea);
    } catch (error) {
      console.error('Error copying record content:', error);
      setToastMessage(`复制错误: ${(error as Error).message}`);
    }
  };

  const handleFieldSelectionChange = (fieldId: string) => {
    setFieldOptions(prev => 
      prev.map(opt => 
        opt.id === fieldId ? { ...opt, selected: !opt.selected } : opt
      )
    );
    
    setSelectedFields(prev => {
      if (prev.includes(fieldId)) {
        return prev.filter(id => id !== fieldId);
      } else {
        return [...prev, fieldId];
      }
    });
  };

  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  const selectAllFields = () => {
    const allFieldIds = fieldOptions.map(opt => opt.id);
    setFieldOptions(prev => prev.map(opt => ({ ...opt, selected: true })));
    setSelectedFields(allFieldIds);
  };

  const deselectAllFields = () => {
    setFieldOptions(prev => prev.map(opt => ({ ...opt, selected: false })));
    setSelectedFields([]);
  };

  // 初始化字段选项
  const initializeFieldOptions = async () => {
    try {
      const table = await bitable.base.getActiveTable();
      const view = await table.getActiveView();
      const fieldMetaList = await view.getFieldMetaList();
      
      // 获取视图中可见的字段
      const visibleFields = await view.getVisibleFieldIdList();
      
      // 排除索引字段（第一个字段）和隐藏的字段
      const options = fieldMetaList
        .slice(1) // 排除索引字段
        .filter(meta => visibleFields.includes(meta.id)) // 只保留可见字段
        .map(meta => ({
          id: meta.id,
          name: meta.name,
          selected: true
        }));
      
      setFieldOptions(options);
      setSelectedFields(options.map(opt => opt.id));
    } catch (error) {
      console.error('Error initializing field options:', error);
    }
  };

  useEffect(() => {
    // 初始化字段选项
    initializeFieldOptions();

    // 添加数据表切换监听
    const tableChangeListener = bitable.base.onSelectionChange(() => {
      console.log('Selection changed, updating field options...');
      initializeFieldOptions();
    });

    return () => {
      // 清理函数
      tableChangeListener();
    };
  }, []);

  // 检查参数数量是否一致
  const hasConsistentParameterCount = (record: RecordComparison) => {
    if (record.differences.length <= 1) return true;
    
    const firstParamCount = record.differences[0].parameters.length;
    return record.differences.every(diff => diff.parameters.length === firstParamCount);
  };

  // 替换参数
  const replaceParameters = async (recordId: string, replacements: Record<string, Record<number, number>>) => {
    try {
      const table = await bitable.base.getActiveTable();
      const view = await table.getActiveView();
      const fieldMetaList = await view.getFieldMetaList();
      const fields = await table.getFieldList();
      
      // 获取记录
      const record = await table.getRecordById(recordId);
      
      // 获取需要更新的字段
      const fieldsToUpdate: Record<string, any> = {};
      
      for (const [fieldName, paramReplacements] of Object.entries(replacements)) {
        // 查找字段ID
        const fieldMeta = fieldMetaList.find(meta => meta.name === fieldName);
        if (!fieldMeta) continue;
        
        const fieldId = fieldMeta.id;
        const cellValue = record.fields[fieldId];
        
        if (Array.isArray(cellValue) && cellValue.length > 0) {
          const cell = cellValue[0] as TextCell;
          if (cell.type === 'text' && typeof cell.text === 'string') {
            let newText = cell.text;
            
            // 替换所有参数
            for (const [originalParam, newParam] of Object.entries(paramReplacements)) {
              if (Number(originalParam) !== Number(newParam)) {
                // 使用正则表达式替换参数，确保只替换参数而不是普通数字
                const regex = new RegExp(`\\{${originalParam}\\}`, 'g');
                newText = newText.replace(regex, `{${newParam}}`);
              }
            }
            
            // 构建字段更新对象
            fieldsToUpdate[fieldId] = [{ type: 'text', text: newText }];
          }
        }
      }
      
      // 更新记录
      if (Object.keys(fieldsToUpdate).length > 0) {
        // 使用正确的方法更新记录
        // 根据飞书多维表格API，使用setRecord方法更新记录
        // 构建符合IRecordValue类型的对象
        const recordValue = {
          fields: fieldsToUpdate
        };
        
        // @ts-ignore - 忽略类型检查错误，因为API可能已更新但类型定义未更新
        await table.setRecord(recordId, recordValue);
        setToastMessage('参数替换成功');
        
        // 重新比较记录以更新UI
        await compareAllRecords();
      }
    } catch (error) {
      console.error('Error replacing parameters:', error);
      setToastMessage(`替换参数失败: ${(error as Error).message}`);
    }
  };

  return (
    <div style={{ 
      padding: '24px', 
      maxWidth: '1200px', 
      margin: '0 auto',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      color: '#333'
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '24px',
        borderBottom: '1px solid #eaeaea',
        paddingBottom: '16px'
      }}>
        <h2 style={{ 
          margin: 0, 
          fontSize: '24px', 
          fontWeight: 600,
          color: '#1a73e8'
        }}>参数对照表</h2>
        
        <button 
          onClick={compareAllRecords}
          disabled={isComparing}
          style={{ 
            padding: '10px 20px', 
            backgroundColor: isComparing ? '#ccc' : '#1a73e8',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isComparing ? 'not-allowed' : 'pointer',
            fontWeight: 500,
            fontSize: '14px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            transition: 'background-color 0.2s, transform 0.1s',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
          onMouseOver={e => !isComparing && (e.currentTarget.style.transform = 'translateY(-1px)')}
          onMouseOut={e => !isComparing && (e.currentTarget.style.transform = 'translateY(0)')}
        >
          {isComparing ? (
            <>
              <span style={{ display: 'inline-block', width: '16px', height: '16px', border: '2px solid white', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></span>
              比较中...
            </>
          ) : '比较所有记录'}
        </button>
      </div>
      
      {/* 字段选择下拉菜单 */}
      <div style={{ 
        marginBottom: '24px', 
        position: 'relative',
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        padding: '16px',
        border: '1px solid #eaeaea'
      }}>
        <h3 style={{ 
          margin: '0 0 12px 0', 
          fontSize: '16px', 
          fontWeight: 500,
          color: '#555'
        }}>选择要比较的字段</h3>
        <div 
          style={{ 
            border: '1px solid #ddd', 
            borderRadius: '4px', 
            padding: '10px 14px', 
            cursor: 'pointer',
            backgroundColor: 'white',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            transition: 'border-color 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}
          onClick={toggleDropdown}
          onMouseOver={e => e.currentTarget.style.borderColor = '#1a73e8'}
          onMouseOut={e => e.currentTarget.style.borderColor = '#ddd'}
        >
          <span style={{ color: selectedFields.length === 0 ? '#999' : '#333' }}>
            {selectedFields.length === 0 
              ? '请选择字段' 
              : selectedFields.length === fieldOptions.length 
                ? '已选择所有字段' 
                : `已选择 ${selectedFields.length}/${fieldOptions.length} 个字段`}
          </span>
          <span style={{ color: '#666' }}>{isDropdownOpen ? '▲' : '▼'}</span>
        </div>
        
        {isDropdownOpen && (
          <div style={{ 
            border: '1px solid #ddd', 
            borderRadius: '4px', 
            padding: '12px',
            marginTop: '8px',
            maxHeight: '300px',
            overflowY: 'auto',
            backgroundColor: 'white',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            zIndex: 1000
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              marginBottom: '12px',
              paddingBottom: '12px',
              borderBottom: '1px solid #eee'
            }}>
              <button 
                onClick={selectAllFields}
                style={{ 
                  padding: '6px 12px', 
                  backgroundColor: '#f8f9fa', 
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  color: '#333',
                  fontWeight: 500,
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.backgroundColor = '#e9ecef'}
                onMouseOut={e => e.currentTarget.style.backgroundColor = '#f8f9fa'}
              >
                全选
              </button>
              <button 
                onClick={deselectAllFields}
                style={{ 
                  padding: '6px 12px', 
                  backgroundColor: '#f8f9fa', 
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  color: '#333',
                  fontWeight: 500,
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.backgroundColor = '#e9ecef'}
                onMouseOut={e => e.currentTarget.style.backgroundColor = '#f8f9fa'}
              >
                取消全选
              </button>
            </div>
            {fieldOptions.map(option => (
              <div 
                key={option.id} 
                style={{ 
                  padding: '8px 0',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'background-color 0.2s',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
                onMouseOver={e => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
                onClick={() => handleFieldSelectionChange(option.id)}
              >
                <input
                  type="checkbox"
                  checked={option.selected}
                  onChange={() => {}}
                  style={{ 
                    marginRight: '10px',
                    width: '16px',
                    height: '16px',
                    cursor: 'pointer'
                  }}
                />
                <span style={{ fontSize: '14px' }}>{option.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {comparisons.length > 0 && (
        <div style={{ 
          marginBottom: '24px',
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          border: '1px solid #eaeaea',
          overflow: 'hidden'
        }}>
          <div style={{ 
            padding: '16px',
            borderBottom: '1px solid #eaeaea',
            backgroundColor: '#f8f9fa'
          }}>
            <h3 style={{ 
              margin: 0, 
              fontSize: '18px', 
              fontWeight: 500,
              color: '#333'
            }}>不一致的记录 ({comparisons.length})</h3>
          </div>
          
          {comparisons.map((comparison, index) => (
            <div 
              key={index} 
              style={{ 
                padding: '16px',
                borderBottom: index < comparisons.length - 1 ? '1px solid #eaeaea' : 'none',
                backgroundColor: index % 2 === 0 ? 'white' : '#fafafa'
              }}
            >
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: '12px'
              }}>
                <h4 style={{ 
                  margin: 0, 
                  fontSize: '16px', 
                  fontWeight: 500,
                  color: '#333'
                }}>记录: {comparison.recordName}</h4>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    onClick={() => setEditingRecord(comparison)}
                    disabled={!hasConsistentParameterCount(comparison)}
                    style={{ 
                      padding: '6px 12px', 
                      backgroundColor: hasConsistentParameterCount(comparison) ? '#1a73e8' : '#ccc', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '4px', 
                      cursor: hasConsistentParameterCount(comparison) ? 'pointer' : 'not-allowed',
                      fontSize: '13px',
                      fontWeight: 500,
                      transition: 'background-color 0.2s, transform 0.1s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                    }}
                    onMouseOver={e => hasConsistentParameterCount(comparison) && (e.currentTarget.style.transform = 'translateY(-1px)')}
                    onMouseOut={e => hasConsistentParameterCount(comparison) && (e.currentTarget.style.transform = 'translateY(0)')}
                  >
                    编辑
                  </button>
                  <button 
                    onClick={() => copyRecordContent(comparison)}
                    style={{ 
                      padding: '6px 12px', 
                      backgroundColor: '#4CAF50', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '4px', 
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 500,
                      transition: 'background-color 0.2s, transform 0.1s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                    }}
                    onMouseOver={e => {
                      e.currentTarget.style.backgroundColor = '#43a047';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseOut={e => {
                      e.currentTarget.style.backgroundColor = '#4CAF50';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    复制
                  </button>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ 
                  borderCollapse: 'collapse', 
                  width: '100%',
                  fontSize: '14px'
                }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f5f5f5' }}>
                      <th style={{ 
                        border: '1px solid #e0e0e0', 
                        padding: '10px 12px',
                        textAlign: 'left',
                        fontWeight: 500,
                        color: '#555'
                      }}>字段名</th>
                      <th style={{ 
                        border: '1px solid #e0e0e0', 
                        padding: '10px 12px',
                        textAlign: 'left',
                        fontWeight: 500,
                        color: '#555'
                      }}>参数列表</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.differences.map((diff, diffIndex) => (
                      <tr key={diffIndex} style={{ backgroundColor: diffIndex % 2 === 0 ? 'white' : '#fafafa' }}>
                        <td style={{ 
                          border: '1px solid #e0e0e0', 
                          padding: '10px 12px',
                          color: '#333'
                        }}>{diff.fieldName}</td>
                        <td style={{ 
                          border: '1px solid #e0e0e0', 
                          padding: '10px 12px',
                          color: '#333'
                        }}>{diff.parameters.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* 飘字提示 */}
      {floatingMessage && <FloatingMessage message={floatingMessage} onClose={() => setFloatingMessage('')} />}
      
      {/* 绿框飘字提示 */}
      {toastMessage && <GreenToast message={toastMessage} onClose={() => setToastMessage('')} />}
      
      {/* 参数编辑弹窗 */}
      {editingRecord && (
        <ParameterEditModal 
          record={editingRecord} 
          onClose={() => setEditingRecord(null)} 
          onSave={replaceParameters} 
        />
      )}
      
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
} 