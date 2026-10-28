import { css } from '@linaria/core';

export const tagStaticClassName = 'cds-tag';

const nodeCss = css`
  display: flex;
  align-items: center;
`;

export const Tag = ({ intent = 'informational', start, children }: TagProps) => (
  <Box
    background={intent === 'promotional' ? 'bgPositive' : 'bgPositiveWash'}
    borderRadius={200}
    className={tagStaticClassName}
    paddingX={1}
  >
    <div className={nodeCss}>{start}</div>
    <Text color={intent === 'promotional' ? 'fgInverse' : 'fgPositive'}>{children}</Text>
  </Box>
);
